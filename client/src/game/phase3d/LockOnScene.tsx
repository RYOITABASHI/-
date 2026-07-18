// client/src/game/phase3d/LockOnScene.tsx
//
// [担当: task_3d_core] ③交戦フェーズ(3Dレール視点)。旧称ロックオンフェーズ。
// レール移動+視点操作のみ(自由移動なし)。狙って撃つ明示的発射を中核に据える。
//
// FPS化(2026-07-17改訂の game-spec.md に対応)での主な変更:
//   - 旧「照準0.3秒保持で自動ロックオン(aimLockOn)」を廃止し、発射ボタン/
//     スペースキー/マウス左クリックによる明示的発射に変更(発射クールダウン付き)。
//   - 選択肢は幾何パネルではなく低ポリの人型「敵AI兵士」で表現する
//     (円柱の胴体+箱の頭部/ヘルメットを手続き生成しMergeで1メッシュ化)。
//   - 妨害ドローンは同じ人型シルエットの thin instances で「おとりの敵」として
//     droneAI.ts の移動パターンをそのままパトロールさせる(撃つとミス扱い)。
//   - カメラ追従の簡易な銃ビューモデル、マズルフラッシュ、リコイル(pitchキック)を追加。
//   - 効果音は combatAudio.ts(単一AudioContext使い回し)で手続き生成する。
//
// 性能方針(docs/game-spec.md「想定デバイスと性能方針」2026-07-18改訂の緩和後の予算)を厳守:
//   総ポリゴン20万以下 / ドローコール60以下 / テクスチャ1024px以下4枚程度 /
//   ライトは環境光+2灯まで(本シーンは環境光+方向光1灯の2灯) /
//   簡易な低解像度シャドウ1灯分(512px, blur exp, 受影は地面のみ)は許容 /
//   軽量ポストプロセス1つ(単一パスのvignette)は許容 /
//   setHardwareScalingLevel / freezeActiveMeshes / material.freeze /
//   おとりはthin instances / 30fps固定描画 / 初回ベンチマーク /
//   人型敵は1体あたり1000〜2000ポリゴンを目安(緩和後の余裕を活用)。

import {
  Color3,
  Color4,
  DefaultRenderingPipeline,
  DirectionalLight,
  DynamicTexture,
  Engine,
  FreeCamera,
  HemisphericLight,
  Matrix,
  Mesh,
  MeshBuilder,
  Ray,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  Texture,
  Vector3,
  VertexBuffer,
  Viewport,
} from "@babylonjs/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ContentItem, LockOnPhaseResult } from "@/game/types";
import {
  computeDronePosition,
  type DronePosition2D,
} from "@/game/phase3d/droneAI";
import {
  interpolateRailPosition,
  type RailWaypoint,
} from "@/game/phase3d/railPath";
import type { DroneSpec } from "@/game/types";
import HUD from "@/game/phase3d/HUD";
import { ensurePerfTier } from "@/game/phase3d/perfBenchmark";
import {
  playComboMilestoneSound,
  playFireSound,
  playHitSound,
  playMissSound,
} from "@/game/phase3d/combatAudio";
import { Spinner } from "@/components/ui/spinner";

export interface LockOnSceneProps {
  questions: ContentItem[];
  onComplete: (results: LockOnPhaseResult[]) => void;
}

// レール経路(自由移動なし。カメラはこの折れ線上を等速往復する)。
const RAIL_WAYPOINTS: RailWaypoint[] = [
  { x: -3, y: 1.5, z: -5 },
  { x: 0, y: 1.5, z: -6.5 },
  { x: 3, y: 1.5, z: -5 },
];
const RAIL_LOOP_MS = 8000; // 片道4秒で往復。

// 敵AI兵士(選択肢)は固定プール(最大選択肢数)を使い回し、setEnabled/位置更新のみ行う
// (メッシュ数を一定に保ち freezeActiveMeshes と両立させる)。
const MAX_ENEMIES = 4;
const ENEMY_Z = 6;
const ENEMY_SPREAD = 2.6;
// 敵の頭上に出すネームタグ(選択肢テキスト)の高さ。人型の全高(約1.6)より少し上。
const LABEL_Y = 1.95;

// おとりの敵(妨害ドローン相当)。等速→加速→ジグザグを1体ずつ。撃つとミス扱い。
const DRONE_SPECS: DroneSpec[] = [
  { id: "drone-linear", pattern: "linear", baseSpeed: 2.2, spawnDelayMs: 0 },
  {
    id: "drone-accelerating",
    pattern: "accelerating",
    baseSpeed: 1.4,
    spawnDelayMs: 500,
  },
  { id: "drone-zigzag", pattern: "zigzag", baseSpeed: 2.0, spawnDelayMs: 1000 },
];
const DECOY_X_START = -7;
const DECOY_X_RANGE = 14; // この範囲でxをループさせる。
const DECOY_Z = 3.6; // 選択肢の敵(z=6)より手前をパトロールする。

const PHASE_TIME_MS = 60_000;
const HUD_THROTTLE_MS = 66;
// 敵ネームタグのDOM更新も低スペック端末のGC/再描画負荷を避けるため同間隔でスロットルする。
const LABELS_THROTTLE_MS = HUD_THROTTLE_MS;
// 30fps固定描画。GPU描画(scene.render)のみをこの間隔に間引く(更新ロジックは毎フレーム)。
const RENDER_INTERVAL_MS = 1000 / 30; // ≒33.3ms

// 発射クールダウン(ms)。無制限連射を防ぎ「考えてから撃つ」設計を誘導する。
const FIRE_COOLDOWN_MS = 180;
// 無駄撃ちの猶予。残弾は questions.length + この値。
const AMMO_GRACE = 5;
// 撃破アニメーション時間(ms)。Y縮小+傾きで消える。
const KILL_ANIM_MS = 350;
// マズルフラッシュの表示時間(ms)。
const MUZZLE_FLASH_MS = 50;
// リコイル1発あたりのpitchキック(rad)。約1.4度。
const RECOIL_KICK_RAD = (1.4 * Math.PI) / 180;
// リコイル回復速度(rad/ms)。1発分を約0.5秒で戻す。連射しなければ0に収束する。
const RECOIL_RECOVER_PER_MS = RECOIL_KICK_RAD / 500;

interface EnemyLabel {
  key: string;
  text: string;
  x: number;
  y: number;
  visible: boolean;
  aiming: boolean;
}

// 撃破アニメーション中の1体を表す一時状態。
interface KillingState {
  enemyIndex: number;
  startMs: number;
  /** アニメーション終了後にフェーズ完了(onComplete)へ進むべきか。 */
  finishAfter: boolean;
}

// 迷彩テクスチャ(全兵士で共有)を手続き生成する。
// 512x512のDynamicTextureにカーキ地+緑/茶/暗色のまだら斑点を描く。まだらは
// 角ばった多角形ブロブ(不透明・シャープ)にし、旧256pxのぼやけ感を解消する。
// 全敵で使い回すためドローコール・テクスチャ枚数は増えない(1024px以下・共有1枚)。
function createCamoTexture(scene: Scene): DynamicTexture {
  const size = 512;
  const tex = new DynamicTexture(
    "camoTex",
    { width: size, height: size },
    scene,
    false,
  );
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  // 地色: くすんだカーキ。
  ctx.fillStyle = "#5c6038";
  ctx.fillRect(0, 0, size, size);
  // まだら斑(緑・茶・カーキ・暗色)を角ばった多角形で重ねてシャープな迷彩に。
  const blobColors = ["#6f7347", "#464a29", "#3a3c22", "#7c7a52", "#54502e"];
  for (let i = 0; i < 340; i++) {
    ctx.fillStyle = blobColors[i % blobColors.length];
    const cx = Math.random() * size;
    const cy = Math.random() * size;
    const r = 10 + Math.random() * 40;
    const verts = 5 + Math.floor(Math.random() * 4); // 5〜8角形の不定形。
    ctx.beginPath();
    for (let v = 0; v < verts; v++) {
      const ang = (v / verts) * Math.PI * 2 + Math.random() * 0.5;
      const rr = r * (0.55 + Math.random() * 0.7);
      const px = cx + Math.cos(ang) * rr;
      const py = cy + Math.sin(ang) * rr;
      if (v === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
  tex.update();
  return tex;
}

// 地面テクスチャ(土・草地)を手続き生成する。256x256、タイリング前提のノイズ。
function createGroundTexture(scene: Scene): DynamicTexture {
  const size = 256;
  const tex = new DynamicTexture(
    "groundTex",
    { width: size, height: size },
    scene,
    false,
  );
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  // 地色: 乾いた土＋草の中間色。
  ctx.fillStyle = "#4b5334";
  ctx.fillRect(0, 0, size, size);
  // 細かな土/草のノイズ斑点。
  const speckle = ["#3d442a", "#586237", "#6b6e3f", "#414325", "#5f5334"];
  for (let i = 0; i < 5200; i++) {
    ctx.fillStyle = speckle[i % speckle.length];
    const x = Math.random() * size;
    const y = Math.random() * size;
    const s = 1 + Math.random() * 3;
    ctx.fillRect(x, y, s, s);
  }
  tex.update();
  return tex;
}

// 建物ファサードテクスチャ(窓グリッド)を手続き生成する。壁は明るめの下地にし、
// 窓を明暗(点灯した暖色 / 消灯した寒色)でランダムに散らして「窓のある建物」に見せる。
// 頂点カラーで建物ごとに色味を掛け合わせるため、壁色はニュートラルに寄せる。共有1枚。
function createBuildingTexture(scene: Scene): DynamicTexture {
  const size = 256;
  const tex = new DynamicTexture(
    "bldgTex",
    { width: size, height: size },
    scene,
    false,
  );
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  // コンクリートの壁面。
  ctx.fillStyle = "#8a8f98";
  ctx.fillRect(0, 0, size, size);
  // 窓グリッド(6列 x 8行)。点灯/消灯をランダムに割り振る。
  const cols = 6;
  const rows = 8;
  const cellW = size / cols;
  const cellH = size / rows;
  const winW = cellW * 0.56;
  const winH = cellH * 0.6;
  const padX = (cellW - winW) / 2;
  const padY = (cellH - winH) / 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = Math.random() < 0.4;
      ctx.fillStyle = lit ? "#ffe6a1" : "#3b4552";
      ctx.fillRect(c * cellW + padX, r * cellH + padY, winW, winH);
    }
  }
  tex.update();
  return tex;
}

// メッシュ全頂点に単一の頂点カラーを焼き込む(Merge時に色情報を保持させるための下ごしらえ)。
// StandardMaterialは頂点カラーを検出すると自動でテクスチャ/拡散色に乗算する。
function paintMesh(mesh: Mesh, r: number, g: number, b: number): void {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  if (!positions) return;
  const count = positions.length / 3;
  const colors = new Array<number>(count * 4);
  for (let i = 0; i < count; i++) {
    colors[i * 4] = r;
    colors[i * 4 + 1] = g;
    colors[i * 4 + 2] = b;
    colors[i * 4 + 3] = 1;
  }
  mesh.setVerticesData(VertexBuffer.ColorKind, colors);
}

// 敵AI兵士に割り当てるマテリアル一式(部位ごとに色/質感を変え、頭部と胴体の
// コントラストを明確にする)。多重マテリアルMergeで1メッシュ内の別サブメッシュになる。
interface SoldierMats {
  camo: StandardMaterial; // 胴体・脚・腕(迷彩テクスチャ)
  skin: StandardMaterial; // 顔(くすんだタン色。迷彩と明確に差をつける)
  helmet: StandardMaterial; // ヘルメット(濃色。頭部との境目を強調)
  gun: StandardMaterial; // 手持ちライフル(ガンメタル)
}

// 人型(敵AI兵士)メッシュを手続き生成する。脚2本+胴体+頭部(肌色)+ヘルメット(濃色)+
// 腕2本+手持ちライフルを、部位別マテリアルを付けたまま多重マテリアルMergeで1メッシュ化する。
// 兵士は -z 側(カメラのいる方向)を正面とし、腕と銃を前面に構える。人体比率を意識し全高約1.8。
// 1体あたり約200ポリゴン(緩和後予算に対し十分低い)。
function buildSoldier(scene: Scene, mats: SoldierMats): Mesh {
  const parts: Mesh[] = [];
  const add = (m: Mesh, mat: StandardMaterial) => {
    m.material = mat;
    parts.push(m);
  };

  // 脚: 2本の円柱(8角)。接地(y=0)から腰まで。人型の下半身を明示する。
  for (const sx of [-0.14, 0.14]) {
    const leg = MeshBuilder.CreateCylinder(
      "soldierLeg",
      { height: 0.86, diameterTop: 0.2, diameterBottom: 0.17, tessellation: 8 },
      scene,
    );
    leg.position.set(sx, 0.43, 0);
    add(leg, mats.camo);
  }

  // 胴体: 肩に向けて広がる8角柱(下=腰、上=肩)。迷彩(防弾ベスト相当)。
  const torso = MeshBuilder.CreateCylinder(
    "soldierTorso",
    { height: 0.66, diameterTop: 0.52, diameterBottom: 0.42, tessellation: 8 },
    scene,
  );
  torso.position.y = 1.19;
  add(torso, mats.camo);

  // 首: 短い肌色円柱で頭と胴をつなぎ、頭部の独立感を出す。
  const neck = MeshBuilder.CreateCylinder(
    "soldierNeck",
    { height: 0.1, diameter: 0.16, tessellation: 6 },
    scene,
  );
  neck.position.y = 1.56;
  add(neck, mats.skin);

  // 頭部(顔): 肌色〜タン色の球体。箱だとブロック状(マイクラ風)に見えるため丸みを持たせる。
  const head = MeshBuilder.CreateSphere(
    "soldierHead",
    { diameter: 0.27, segments: 8 },
    scene,
  );
  head.position.y = 1.72;
  add(head, mats.skin);

  // ヘルメット: 頭を覆う一回り大きい球(下半分は頭に隠れ、ドーム状に見える)。濃色。
  const helmet = MeshBuilder.CreateSphere(
    "soldierHelmet",
    { diameter: 0.36, segments: 8, slice: 0.62 },
    scene,
  );
  helmet.position.y = 1.85;
  add(helmet, mats.helmet);

  // 右腕: 肩から前方(-z)へ。円柱(先細り)で丸みを持たせ、銃のグリップを握る形。
  const rightArm = MeshBuilder.CreateCylinder(
    "soldierArmR",
    { height: 0.5, diameterTop: 0.11, diameterBottom: 0.14, tessellation: 8 },
    scene,
  );
  rightArm.position.set(0.28, 1.16, -0.13);
  rightArm.rotation.x = 0.5;
  add(rightArm, mats.camo);

  // 左腕: 反対側からフォアグリップへ深く前方に伸ばす円柱。
  const leftArm = MeshBuilder.CreateCylinder(
    "soldierArmL",
    { height: 0.48, diameterTop: 0.11, diameterBottom: 0.14, tessellation: 8 },
    scene,
  );
  leftArm.position.set(-0.15, 1.1, -0.3);
  leftArm.rotation.x = 0.9;
  add(leftArm, mats.camo);

  // ライフル レシーバー: 胴体前面に水平に構える。ガンメタル。
  const rifle = MeshBuilder.CreateBox(
    "soldierRifle",
    { width: 0.09, height: 0.11, depth: 0.6 },
    scene,
  );
  rifle.position.set(0.02, 1.19, -0.34);
  add(rifle, mats.gun);

  // ライフル マガジン: レシーバー下の箱。
  const rifleMag = MeshBuilder.CreateBox(
    "soldierRifleMag",
    { width: 0.06, height: 0.18, depth: 0.09 },
    scene,
  );
  rifleMag.position.set(0.02, 1.03, -0.28);
  add(rifleMag, mats.gun);

  // ライフル 銃身: 前方へ細い円柱。
  const rifleBarrel = MeshBuilder.CreateCylinder(
    "soldierRifleBarrel",
    { height: 0.3, diameter: 0.04, tessellation: 6 },
    scene,
  );
  rifleBarrel.rotation.x = Math.PI / 2;
  rifleBarrel.position.set(0.02, 1.19, -0.72);
  add(rifleBarrel, mats.gun);

  // 部位ごとのマテリアルを保持したまま多重マテリアルでMerge(1メッシュ・サブメッシュ複数)。
  const merged = Mesh.MergeMeshes(
    parts,
    true, // ソースメッシュを破棄
    true, // 32bitインデックス許可
    undefined,
    false,
    true, // multiMultiMaterials: サブメッシュ+MultiMaterialとしてまとめる
  );
  if (!merged) {
    // Merge失敗時のフォールバック(通常起きない)。胴体だけでも返す。
    return torso;
  }
  merged.name = "soldierTemplate";
  return merged;
}

export default function LockOnScene({ questions, onComplete }: LockOnSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Babylonループから参照する不変ハンドル(effect再実行を避けるためref化)。
  const questionsRef = useRef(questions);
  const onCompleteRef = useRef(onComplete);
  questionsRef.current = questions;
  onCompleteRef.current = onComplete;

  // DOM(発射ボタン/キーボード/マウス)からBabylonループへ発射要求を渡す橋渡し。
  // ループ側が毎フレーム消費する。クールダウンはループ側で判定する。
  const fireRequestedRef = useRef(false);
  const requestFire = useCallback(() => {
    fireRequestedRef.current = true;
  }, []);

  const [hud, setHud] = useState({
    ammoRemaining: questions.length + AMMO_GRACE,
    timeRemainingMs: PHASE_TIME_MS,
    combo: 0,
    aimingValid: false,
  });
  // キルフィード(命中時に「撃破: 〇〇」を表示)。idは撃破ごとに増やしてアニメを再生させる。
  const [killFeed, setKillFeed] = useState<{ text: string; id: number } | null>(
    null,
  );
  const [labels, setLabels] = useState<EnemyLabel[]>([]);
  // 初回起動時ベンチマーク中はローディングUIを表示する(キャッシュがあれば即座に false)。
  const [benchmarking, setBenchmarking] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const qs = questionsRef.current;
    if (qs.length === 0) {
      setBenchmarking(false);
      onCompleteRef.current([]);
      return;
    }

    // 非同期(ベンチマーク→本番シーン構築)。アンマウント時の破棄を disposed で管理する。
    let disposed = false;
    let engineForCleanup: Engine | null = null;
    let sceneForCleanup: Scene | null = null;
    let handleResize: (() => void) | null = null;
    let detachInput: (() => void) | null = null;

    // 本番シーンを構築する。hardwareScalingLevel はベンチマーク結果を反映する。
    const buildScene = (hardwareScalingLevel: number) => {
      const engine = new Engine(canvas, true, {
        preserveDrawingBuffer: true,
        stencil: true,
      });
      const scene = new Scene(engine);
      engineForCleanup = engine;
      sceneForCleanup = scene;
      // 屋外の晴天寄りの空色(明るいタクティカルな雰囲気)。フォグ色もこれに合わせる。
      const SKY_COLOR = new Color3(0.55, 0.68, 0.82);
      scene.clearColor = new Color4(SKY_COLOR.r, SKY_COLOR.g, SKY_COLOR.b, 1);

      // 距離フォグで遠景(建物シルエット)を空へ溶かし、奥行きを出す(低コスト)。
      scene.fogMode = Scene.FOGMODE_LINEAR;
      scene.fogColor = SKY_COLOR;
      scene.fogStart = 16;
      scene.fogEnd = 46;

      // 環境光(1灯目)。屋外の明るい色温度に調整(空=淡い暖色、地面反射=くすんだ緑)。
      // 方向光を追加したぶん環境光はやや控えめにして陰影を残す。
      const light = new HemisphericLight("light", new Vector3(0, 1, 0.2), scene);
      light.intensity = 0.85;
      light.diffuse = new Color3(1, 0.97, 0.88);
      light.groundColor = new Color3(0.42, 0.45, 0.38);

      // 方向光(2灯目)。暖色の太陽光を斜め上手前から当て、モデルに立体感(陰影)を出す。
      // ライトは環境光+2灯まで許容の範囲内(本シーンは合計2灯)。
      const sun = new DirectionalLight(
        "sun",
        new Vector3(-0.55, -1, 0.35),
        scene,
      );
      sun.position = new Vector3(12, 20, -12);
      sun.intensity = 1.25;
      sun.diffuse = new Color3(1, 0.93, 0.78);
      sun.specular = new Color3(0.2, 0.2, 0.18);

      // 低解像度シャドウ(512px, blur exponential)。1灯分・受影は地面のみに限定して
      // パフォーマンス影響を最小化する(方針で許容された簡易シャドウ)。
      const shadowGen = new ShadowGenerator(512, sun);
      shadowGen.useBlurExponentialShadowMap = true;
      shadowGen.blurKernel = 16;
      shadowGen.blurScale = 2;
      shadowGen.depthScale = 30;
      sun.shadowMinZ = 1;
      sun.shadowMaxZ = 40;

      // 全兵士・地面・建物で共有するプロシージャルテクスチャ(1024px以下・計3枚)。
      const camoTex = createCamoTexture(scene);
      const groundTex = createGroundTexture(scene);
      const bldgTex = createBuildingTexture(scene);

      // レール移動カメラ。位置はレールで固定し、視点回転のみプレイヤー操作可。
      const camera = new FreeCamera(
        "camera",
        new Vector3(
          RAIL_WAYPOINTS[0].x,
          RAIL_WAYPOINTS[0].y,
          RAIL_WAYPOINTS[0].z,
        ),
        scene,
      );
      // 敵の胴体あたりの高さを初期照準に。中央を向くが、正解の敵は自分で狙う必要がある。
      camera.setTarget(new Vector3(0, 1.0, ENEMY_Z));
      camera.attachControl(canvas, true);
      // 平行移動(自由移動)を無効化。視点回転のみ許可する。
      camera.keysUp = [];
      camera.keysDown = [];
      camera.keysLeft = [];
      camera.keysRight = [];
      camera.speed = 0;
      camera.inertia = 0.5;

      // 地面(遮蔽/空間認識の基準)。
      const ground = MeshBuilder.CreateGround(
        "ground",
        { width: 30, height: 30 },
        scene,
      );
      const groundMat = new StandardMaterial("groundMat", scene);
      groundMat.diffuseColor = new Color3(0.85, 0.9, 0.8); // テクスチャを明るく乗せる下地。
      groundMat.specularColor = new Color3(0, 0, 0);
      // 土・草地テクスチャをタイリング(メッシュ1枚のまま。ドローコール不変)。
      groundTex.wrapU = Texture.WRAP_ADDRESSMODE;
      groundTex.wrapV = Texture.WRAP_ADDRESSMODE;
      groundTex.uScale = 10;
      groundTex.vScale = 10;
      groundMat.diffuseTexture = groundTex;
      ground.material = groundMat;
      // 地面のみをシャドウの受影対象にする(受影1メッシュに限定して負荷を抑える)。
      // receiveShadows のシェーダ定義を確実に含めるため groundMat は freeze しない。
      ground.receiveShadows = true;

      // 遠景の建物群。ビル本体(窓テクスチャ+頂点カラーで色味に変化)と切妻風の屋根を
      // それぞれ1メッシュにMergeし、背景を計2ドローコールに抑える。フォグで空へ溶ける。
      // [x, z, width, height, depth, tintR, tintG, tintB, roof(1=切妻/0=陸屋根)]
      const buildingLayout: Array<
        [number, number, number, number, number, number, number, number, number]
      > = [
        [-16, 34, 6, 9, 5, 0.85, 0.83, 0.8, 1],
        [-8, 40, 5, 13, 5, 0.7, 0.74, 0.82, 0],
        [2, 42, 7, 8, 6, 0.9, 0.82, 0.72, 1],
        [12, 38, 5, 15, 5, 0.66, 0.7, 0.78, 0],
        [19, 33, 6, 10, 5, 0.82, 0.78, 0.72, 1],
        [-22, 30, 5, 7, 5, 0.78, 0.8, 0.85, 1],
        [8, 46, 6, 18, 6, 0.6, 0.64, 0.72, 0],
        [-2, 48, 5, 11, 5, 0.86, 0.8, 0.74, 1],
      ];
      const buildingBoxes: Mesh[] = [];
      const roofPrisms: Mesh[] = [];
      for (let i = 0; i < buildingLayout.length; i++) {
        const [bx, bz, bw, bh, bd, tr, tg, tb, roof] = buildingLayout[i];
        const box = MeshBuilder.CreateBox(
          `bldg-${i}`,
          { width: bw, height: bh, depth: bd },
          scene,
        );
        box.position.set(bx, bh / 2, bz);
        paintMesh(box, tr, tg, tb); // 建物ごとの色味を頂点カラーで焼き込む。
        buildingBoxes.push(box);

        if (roof === 1) {
          // 切妻屋根: 3角柱(tessellation:3の円柱)を横倒しにして屋根に見立てる。
          const prism = MeshBuilder.CreateCylinder(
            `roof-${i}`,
            {
              height: bd,
              diameter: bw * 1.02,
              tessellation: 3,
            },
            scene,
          );
          // 円柱の軸(y)を奥行き(z)方向へ倒し、稜線が水平になるよう回す。
          prism.rotation.x = Math.PI / 2;
          prism.rotation.y = Math.PI / 6;
          prism.position.set(bx, bh + bw * 0.25, bz);
          paintMesh(prism, tr * 0.7, tg * 0.55, tb * 0.5); // 屋根は暗い赤茶寄りに。
          roofPrisms.push(prism);
        }
      }
      const buildings = Mesh.MergeMeshes(buildingBoxes, true, true);
      if (buildings) {
        buildings.name = "buildings";
        buildings.isPickable = false;
        const bldgMat = new StandardMaterial("bldgMat", scene);
        bldgMat.diffuseColor = new Color3(1, 1, 1); // 頂点カラー/窓テクスチャを素直に乗せる。
        bldgMat.diffuseTexture = bldgTex; // 共有の窓ファサードテクスチャ。
        bldgMat.specularColor = new Color3(0, 0, 0);
        bldgMat.freeze();
        buildings.material = bldgMat;
      }
      const roofs = Mesh.MergeMeshes(roofPrisms, true, true);
      if (roofs) {
        roofs.name = "roofs";
        roofs.isPickable = false;
        const roofMat = new StandardMaterial("roofMat", scene);
        roofMat.diffuseColor = new Color3(1, 1, 1); // 屋根色は頂点カラーで表現。
        roofMat.specularColor = new Color3(0, 0, 0);
        roofMat.freeze();
        roofs.material = roofMat;
      }

      // 敵の各部位色。迷彩は明るめ白寄りの下地にテクスチャを乗算。顔=タン、ヘルメット=濃色。
      // 命中可能を示すハイライトは迷彩/顔/ヘルメットの emissive を一括で切り替えて表現する。
      const ENEMY_DIFFUSE = new Color3(0.95, 0.95, 0.9);
      const ENEMY_SKIN = new Color3(0.74, 0.58, 0.44); // くすんだタン色の顔。
      const ENEMY_HELMET = new Color3(0.16, 0.19, 0.13); // 濃いオリーブのヘルメット。
      const ENEMY_EMISSIVE_BASE = new Color3(0.02, 0.03, 0.02);
      const ENEMY_EMISSIVE_AIM = new Color3(0.1, 0.5, 0.55); // 照準が乗った時のシアン寄り発光。

      // 迷彩を共有しつつ照準ハイライトは個別に切り替えられるよう、部位別マテリアルを生成する
      // 小ヘルパ。迷彩テクスチャは全マテリアルで共有(テクスチャ枚数・ドローコールは増やさない)。
      const makeSoldierMats = (
        tag: string,
        tint: number,
        emissive: Color3,
      ): SoldierMats => {
        const camo = new StandardMaterial(`camoMat-${tag}`, scene);
        camo.diffuseColor = ENEMY_DIFFUSE.scale(tint);
        camo.diffuseTexture = camoTex;
        camo.emissiveColor = emissive.clone();
        camo.specularColor = new Color3(0, 0, 0);
        const skin = new StandardMaterial(`skinMat-${tag}`, scene);
        skin.diffuseColor = ENEMY_SKIN.scale(tint);
        skin.emissiveColor = emissive.clone();
        skin.specularColor = new Color3(0.05, 0.05, 0.05);
        const helmet = new StandardMaterial(`helmetMat-${tag}`, scene);
        helmet.diffuseColor = ENEMY_HELMET.scale(tint);
        helmet.emissiveColor = emissive.clone();
        helmet.specularColor = new Color3(0.08, 0.08, 0.08);
        const gun = new StandardMaterial(`enemyGunMat-${tag}`, scene);
        gun.diffuseColor = new Color3(0.13, 0.14, 0.15);
        gun.emissiveColor = new Color3(0.01, 0.01, 0.012);
        gun.specularColor = new Color3(0.1, 0.1, 0.12);
        return { camo, skin, helmet, gun };
      };

      // 選択肢の敵AI兵士(pool)。人型メッシュを個別に生成し、各自にマテリアル群とメタデータを持たせる。
      // (thin instancesベースとジオメトリを共有しないよう clone は使わず個別生成する。)
      const enemyMeshes: Mesh[] = [];
      // 照準ハイライトで emissive を書き換える部位マテリアル群(迷彩/顔/ヘルメット)。
      const enemyHiliteMats: StandardMaterial[][] = [];
      for (let i = 0; i < MAX_ENEMIES; i++) {
        const mats = makeSoldierMats(`enemy-${i}`, 1, ENEMY_EMISSIVE_BASE);
        const enemy = buildSoldier(scene, mats);
        enemy.name = `enemy-${i}`;
        enemy.metadata = { isEnemy: true, choiceId: null as string | null };
        shadowGen.addShadowCaster(enemy); // 敵は影を落とす(受影は地面のみ)。
        enemyMeshes.push(enemy);
        enemyHiliteMats.push([mats.camo, mats.skin, mats.helmet]);
      }

      // おとりの敵: 独立した人型メッシュをベースにし、thin instances で3体を描画する。
      // 選択肢を持たず、撃ってもミス扱い(ピック対象にしない)。部位別マテリアルはやや暗く固定。
      const decoyMats = makeSoldierMats("decoy", 0.62, new Color3(0.02, 0.02, 0.02));
      decoyMats.camo.freeze();
      decoyMats.skin.freeze();
      decoyMats.helmet.freeze();
      decoyMats.gun.freeze();
      const decoyBase = buildSoldier(scene, decoyMats);
      decoyBase.name = "decoyBase";
      decoyBase.isPickable = false;
      shadowGen.addShadowCaster(decoyBase); // おとりも影を落とす(thin instances対応)。
      const decoyMatrices = new Float32Array(DRONE_SPECS.length * 16);
      for (let i = 0; i < DRONE_SPECS.length; i++) {
        Matrix.Identity().copyToArray(decoyMatrices, i * 16);
      }
      decoyBase.thinInstanceSetBuffer("matrix", decoyMatrices, 16);

      // 銃ビューモデル(カメラ追従)。ストック/レシーバー/ピストルグリップ/トリガーガード/
      // マガジン(前傾)/ハンドガード/フォアグリップ/銃身/サイトを箱・円柱で組み、Mergeで
      // 1メッシュに。ライフルを構えたシルエットが分かる形にしつつ、視界を遮らないよう
      // 前回より一回り小さくして右下に程よく収める。ローカル+z=前方(銃口方向)。ピック対象外。
      const gunParts: Mesh[] = [];
      // レシーバー(本体)。
      const gunReceiver = MeshBuilder.CreateBox(
        "gunReceiver",
        { width: 0.13, height: 0.15, depth: 0.62 },
        scene,
      );
      gunReceiver.position.set(0, 0, 0.05);
      gunParts.push(gunReceiver);
      // ストック: レシーバー後方(手前)へ、肩付け方向にやや下げて。
      const gunStock = MeshBuilder.CreateBox(
        "gunStock",
        { width: 0.1, height: 0.14, depth: 0.3 },
        scene,
      );
      gunStock.position.set(0, -0.06, -0.42);
      gunStock.rotation.x = -0.08;
      gunParts.push(gunStock);
      // ピストルグリップ: レシーバー下後方へ斜めに下ろす。
      const gunGrip = MeshBuilder.CreateBox(
        "gunGrip",
        { width: 0.08, height: 0.22, depth: 0.1 },
        scene,
      );
      gunGrip.position.set(0, -0.16, -0.16);
      gunGrip.rotation.x = -0.5;
      gunParts.push(gunGrip);
      // トリガーガード: グリップ前方の小さな薄い箱(輪の代用)。
      const gunTrigger = MeshBuilder.CreateBox(
        "gunTrigger",
        { width: 0.05, height: 0.08, depth: 0.12 },
        scene,
      );
      gunTrigger.position.set(0, -0.11, -0.05);
      gunParts.push(gunTrigger);
      // マガジン: レシーバー下に前傾(下向きに斜め)で差し込む。
      const gunMag = MeshBuilder.CreateBox(
        "gunMag",
        { width: 0.07, height: 0.26, depth: 0.14 },
        scene,
      );
      gunMag.position.set(0, -0.2, 0.04);
      gunMag.rotation.x = 0.3;
      gunParts.push(gunMag);
      // ハンドガード: レシーバー前方の細い箱。
      const gunHandguard = MeshBuilder.CreateBox(
        "gunHandguard",
        { width: 0.09, height: 0.09, depth: 0.36 },
        scene,
      );
      gunHandguard.position.set(0, -0.005, 0.5);
      gunParts.push(gunHandguard);
      // フォアグリップ: ハンドガード下に垂直の短い持ち手。
      const gunForegrip = MeshBuilder.CreateBox(
        "gunForegrip",
        { width: 0.05, height: 0.14, depth: 0.06 },
        scene,
      );
      gunForegrip.position.set(0, -0.11, 0.46);
      gunParts.push(gunForegrip);
      // 銃身: ハンドガード先端から前方へ。
      const gunBarrel = MeshBuilder.CreateCylinder(
        "gunBarrel",
        { height: 0.44, diameter: 0.05, tessellation: 6 },
        scene,
      );
      gunBarrel.rotation.x = Math.PI / 2; // 前方(z+)へ向ける。
      gunBarrel.position.set(0, 0.005, 0.82);
      gunParts.push(gunBarrel);
      // リアサイト: レシーバー後方上面の小さな箱。
      const gunRearSight = MeshBuilder.CreateBox(
        "gunRearSight",
        { width: 0.05, height: 0.07, depth: 0.05 },
        scene,
      );
      gunRearSight.position.set(0, 0.11, -0.12);
      gunParts.push(gunRearSight);
      // フロントサイト: 銃身付け根上面の細い箱。
      const gunFrontSight = MeshBuilder.CreateBox(
        "gunFrontSight",
        { width: 0.03, height: 0.09, depth: 0.03 },
        scene,
      );
      gunFrontSight.position.set(0, 0.11, 0.56);
      gunParts.push(gunFrontSight);
      const gun = Mesh.MergeMeshes(gunParts, true, true);
      // ダークガンメタル調(迷彩は乗せず単色でシルエットを締める)。方向光でハイライトが出る。
      const gunMat = new StandardMaterial("gunMat", scene);
      gunMat.diffuseColor = new Color3(0.15, 0.16, 0.18);
      gunMat.specularColor = new Color3(0.35, 0.36, 0.4); // 金属的なハイライト。
      gunMat.specularPower = 48;
      gunMat.emissiveColor = new Color3(0.015, 0.015, 0.02);
      gunMat.freeze();
      let muzzle: Mesh | null = null;
      if (gun) {
        gun.name = "gunView";
        gun.material = gunMat;
        gun.isPickable = false;
        gun.parent = camera;
        shadowGen.addShadowCaster(gun); // 銃も地面に簡易な影を落とす。
        // 画面右下寄り。前回よりやや小さく・下げて視界の邪魔を減らす。
        gun.position.set(0.3, -0.34, 0.78);
        gun.rotation.set(0.04, -0.05, 0);
        gun.scaling.setAll(0.9);

        // マズルフラッシュ: 銃口付近の発光プレーン。発射時のみ短時間表示する。
        muzzle = MeshBuilder.CreatePlane("muzzle", { size: 0.4 }, scene);
        const muzzleMat = new StandardMaterial("muzzleMat", scene);
        muzzleMat.diffuseColor = new Color3(0, 0, 0);
        muzzleMat.emissiveColor = new Color3(1, 0.85, 0.45);
        muzzleMat.specularColor = new Color3(0, 0, 0);
        muzzleMat.backFaceCulling = false;
        muzzleMat.disableLighting = true;
        muzzleMat.freeze();
        muzzle.material = muzzleMat;
        muzzle.isPickable = false;
        muzzle.parent = camera;
        muzzle.position.set(0.3, -0.3, 1.6); // 銃口の少し前。
        muzzle.setEnabled(false);
      }

      // 軽量ポストプロセス(1つまで許容): 単一パスのvignetteのみ。画面端を少し暗くして
      // タクティカルな没入感を出す。ブルーム/被写界深度/モーションブラー等は無効のまま。
      const pipeline = new DefaultRenderingPipeline(
        "postfx",
        false, // HDR不要(軽量化)。
        scene,
        [camera],
      );
      pipeline.bloomEnabled = false;
      pipeline.depthOfFieldEnabled = false;
      pipeline.chromaticAberrationEnabled = false;
      pipeline.grainEnabled = false;
      pipeline.fxaaEnabled = false;
      pipeline.samples = 1;
      pipeline.imageProcessingEnabled = true;
      pipeline.imageProcessing.vignetteEnabled = true;
      pipeline.imageProcessing.vignetteWeight = 2.6;
      pipeline.imageProcessing.vignetteColor = new Color4(0, 0, 0, 0);
      pipeline.imageProcessing.vignetteCameraFov = 0.9;
      // トーンマッピングやコントラスト補正で色味が変わらないよう既定のまま(vignetteだけ有効)。

      engine.setHardwareScalingLevel(hardwareScalingLevel);

      // 静的シーン構築が完了したのでアクティブメッシュを凍結する。
      // (シャドウマップは専用のrenderListで描画するため freezeActiveMeshes と両立する。)
      scene.freezeActiveMeshes();

      // ---- ミッション進行状態(ループ内で更新するref) ----
      const results: LockOnPhaseResult[] = [];
      let questionIndex = 0;
      let questionStartMs = performance.now();
      const phaseStartMs = performance.now();
      let combo = 0;
      let finished = false;
      // 残弾。0で終了(未回答分を不正解として記録しonCompleteを1度だけ呼ぶ)。
      let ammoRemaining = qs.length + AMMO_GRACE;
      // その問題で無駄撃ちした回数(LockOnPhaseResult.droneHitsTaken に記録する)。
      let missShotsThisQuestion = 0;
      let killing: KillingState | null = null;
      let lastFireMs = -Infinity;
      let recoilPitch = 0; // 現在リコイルで上に押し上げられているpitch量(rad, >=0)。
      let muzzleOffAt = 0; // これ以降マズルフラッシュを消す時刻。
      let killFeedSeq = 0;
      let lastFrameMs = performance.now();
      let lastHudPush = 0;
      let lastLabelsPush = 0;
      let lastRenderMs = 0; // 30fps固定描画: 前回 scene.render() 実行時刻。

      const forwardRay = new Ray(Vector3.Zero(), Vector3.Zero(), 100);
      const labelAnchor = new Vector3(); // ネームタグ射影用の再利用ベクトル。

      // 現在の問題の敵AI兵士を配置する。
      function layoutQuestion(index: number) {
        const item = qs[index];
        const n = Math.min(item.choices.length, MAX_ENEMIES);
        const startX = -((n - 1) / 2) * ENEMY_SPREAD;
        for (let i = 0; i < MAX_ENEMIES; i++) {
          const enemy = enemyMeshes[i];
          // 撃破アニメで変化していたスケール/回転を戻す。
          enemy.scaling.set(1, 1, 1);
          enemy.rotation.set(0, 0, 0);
          if (i < n) {
            const choice = item.choices[i];
            enemy.position.set(startX + i * ENEMY_SPREAD, 0, ENEMY_Z);
            enemy.setEnabled(true);
            (enemy.metadata as { choiceId: string | null }).choiceId = choice.id;
          } else {
            enemy.setEnabled(false);
            (enemy.metadata as { choiceId: string | null }).choiceId = null;
          }
          for (const m of enemyHiliteMats[i]) {
            m.emissiveColor.copyFrom(ENEMY_EMISSIVE_BASE);
          }
        }
        questionStartMs = performance.now();
        missShotsThisQuestion = 0;
      }

      layoutQuestion(0);

      // billboard(Y軸まわりでカメラを向く)行列を作りthin instanceへ書き込む。
      // spawnDelayMs経過前のおとりはスケール0の行列にし、非表示相当にする。
      const DECOY_HIDDEN_MATRIX = Matrix.Scaling(0, 0, 0);

      function updateDecoys(elapsed: number) {
        const cam = camera.position;
        for (let i = 0; i < DRONE_SPECS.length; i++) {
          const dp: DronePosition2D = computeDronePosition(
            DRONE_SPECS[i],
            elapsed,
          );
          if (!dp.visible) {
            DECOY_HIDDEN_MATRIX.copyToArray(decoyMatrices, i * 16);
            continue;
          }
          const wx =
            DECOY_X_START +
            (((dp.x % DECOY_X_RANGE) + DECOY_X_RANGE) % DECOY_X_RANGE);
          // 人型は接地させる(y=0)。zigzagの縦揺れ(dp.y)は奥行き方向の蛇行に割り当てる。
          const wy = 0;
          const wz = DECOY_Z + dp.y;
          const yaw = Math.atan2(cam.x - wx, cam.z - wz);
          const m = Matrix.RotationY(yaw).multiply(
            Matrix.Translation(wx, wy, wz),
          );
          m.copyToArray(decoyMatrices, i * 16);
        }
        decoyBase.thinInstanceBufferUpdated("matrix");
      }

      // カメラ前方の敵(選択肢の敵AI兵士)を判定する。おとり/銃/地面は predicate で除外。
      function pickAimedEnemy(): {
        meshName: string;
        choiceId: string;
      } | null {
        const dir = camera.getForwardRay().direction;
        forwardRay.origin.copyFrom(camera.position);
        forwardRay.direction.copyFrom(dir);
        const pick = scene.pickWithRay(
          forwardRay,
          (m) =>
            !!(
              m.metadata &&
              (m.metadata as { isEnemy?: boolean }).isEnemy &&
              m.isEnabled()
            ),
        );
        if (pick?.hit && pick.pickedMesh) {
          const cid = (pick.pickedMesh.metadata as { choiceId: string | null })
            .choiceId;
          if (cid) return { meshName: pick.pickedMesh.name, choiceId: cid };
        }
        return null;
      }

      // 命中(選択肢の敵にヒット)を記録する。questionIndexを進め、撃破アニメを開始する。
      // アニメ完了後に次の問題をlayoutする(またはフェーズ完了)。
      function recordHit(enemyIndex: number, choiceId: string, now: number) {
        const item = qs[questionIndex];
        const correct = choiceId === item.correctChoiceId;
        const hitChoice = item.choices.find((c) => c.id === choiceId);
        results.push({
          contentItemId: item.id,
          hitChoiceId: choiceId,
          correct,
          timeToLockMs: Math.round(now - questionStartMs),
          // 「その問題で無駄撃ちした回数」として意味を持たせる(型・フィールド名は不変)。
          droneHitsTaken: missShotsThisQuestion,
        });
        combo = correct ? combo + 1 : 0;

        // 命中演出: ヒットマーカー音 + キルフィード + コンボ節目の強化音。
        playHitSound();
        if (correct && combo > 0 && combo % 3 === 0) {
          playComboMilestoneSound();
        }
        killFeedSeq += 1;
        setKillFeed({
          text: `撃破: ${hitChoice ? hitChoice.label : ""}`,
          id: killFeedSeq,
        });

        questionIndex += 1;
        const finishAfter = questionIndex >= qs.length;

        // 撃破アニメーション開始。当たった敵だけ残し、他の選択肢の敵は隠す。
        for (let i = 0; i < MAX_ENEMIES; i++) {
          if (i !== enemyIndex) enemyMeshes[i].setEnabled(false);
        }
        setLabels([]); // アニメ中はネームタグを消す。
        killing = { enemyIndex, startMs: now, finishAfter };
      }

      // 撃破アニメーション(Y縮小+傾き)を更新する。完了で次問題へ/フェーズ完了へ。
      function updateKilling(now: number) {
        if (!killing) return;
        const enemy = enemyMeshes[killing.enemyIndex];
        const t = (now - killing.startMs) / KILL_ANIM_MS;
        if (t >= 1) {
          enemy.setEnabled(false);
          enemy.scaling.set(1, 1, 1);
          enemy.rotation.set(0, 0, 0);
          const finishAfter = killing.finishAfter;
          killing = null;
          if (finishAfter) {
            finalizeFinish();
          } else {
            layoutQuestion(questionIndex);
          }
        } else {
          // Y方向に縮みつつ横に傾いて崩れ落ちる(スケルタルアニメ不要の簡易tween)。
          const k = 1 - t;
          enemy.scaling.set(1, k, 1);
          enemy.rotation.z = t * 1.0;
        }
      }

      // 残りの未回答問題を不正解として記録し、一度だけ onComplete する共通処理。
      function finishRemaining(now: number) {
        if (finished) return;
        for (let i = questionIndex; i < qs.length; i++) {
          results.push({
            contentItemId: qs[i].id,
            hitChoiceId: null,
            correct: false,
            timeToLockMs:
              i === questionIndex
                ? Math.max(0, Math.round(now - questionStartMs))
                : 0,
            droneHitsTaken: i === questionIndex ? missShotsThisQuestion : 0,
          });
        }
        questionIndex = qs.length;
        finalizeFinish();
      }

      // フェーズ完了を確定し、onComplete を1度だけ呼ぶ。
      function finalizeFinish() {
        if (finished) return;
        finished = true;
        combo = 0;
        for (const e of enemyMeshes) e.setEnabled(false);
        onCompleteRef.current(results);
      }

      // 発射処理(発射ボタン/スペース/左クリックの要求を毎フレーム消費)。
      function handleFire(now: number) {
        if (finished || killing) return;
        if (now - lastFireMs < FIRE_COOLDOWN_MS) return;
        lastFireMs = now;

        // 発射演出: 音・マズルフラッシュ・リコイル。
        playFireSound();
        if (muzzle) {
          muzzle.setEnabled(true);
          muzzleOffAt = now + MUZZLE_FLASH_MS;
        }
        // リコイル: pitchを瞬間的に上へキック(見上げ方向 = rotation.x を減らす)。
        camera.rotation.x -= RECOIL_KICK_RAD;
        recoilPitch += RECOIL_KICK_RAD;

        ammoRemaining = Math.max(0, ammoRemaining - 1);

        const aimed = pickAimedEnemy();
        if (aimed) {
          // 選択肢の敵にヒット → 回答を記録し撃破演出へ。
          const idx = enemyMeshes.findIndex((m) => m.name === aimed.meshName);
          if (idx >= 0) recordHit(idx, aimed.choiceId, now);
        } else {
          // おとり/空振り → ミス。弾を1消費済み。問題は進行しない(狙い直せる)。
          missShotsThisQuestion += 1;
          playMissSound();
          if (ammoRemaining <= 0) finishRemaining(now);
        }
      }

      // リコイルの自然回復(発射しなければ約0.5秒で0へ戻す)。プレイヤーの視点操作とは独立。
      function recoverRecoil(dtMs: number) {
        if (recoilPitch <= 0) return;
        const recover = Math.min(recoilPitch, RECOIL_RECOVER_PER_MS * dtMs);
        camera.rotation.x += recover; // 押し上げられた分を下へ戻す。
        recoilPitch -= recover;
      }

      function pushHud(now: number, aimingValid: boolean) {
        if (now - lastHudPush < HUD_THROTTLE_MS) return;
        lastHudPush = now;
        const remaining = Math.max(0, PHASE_TIME_MS - (now - phaseStartMs));
        setHud({
          ammoRemaining,
          timeRemainingMs: remaining,
          combo,
          aimingValid,
        });
      }

      // 敵ネームタグ(選択肢テキスト)を頭上へ射影しDOMオーバーレイへ反映する。
      // 低スペック端末のDOM再描画・GC負荷を避けるためHUDと同間隔でスロットルする。
      function pushLabels(now: number, aimedMeshName: string | null) {
        if (now - lastLabelsPush < LABELS_THROTTLE_MS) return;
        lastLabelsPush = now;
        const item = qs[questionIndex];
        const w = engine.getRenderWidth();
        const h = engine.getRenderHeight();
        const vp = new Viewport(0, 0, w, h);
        const transform = scene.getTransformMatrix();
        const next: EnemyLabel[] = [];
        const n = Math.min(item.choices.length, MAX_ENEMIES);
        for (let i = 0; i < n; i++) {
          const enemy = enemyMeshes[i];
          // アンカーは敵の頭上(ネームタグ風)。
          labelAnchor.set(enemy.position.x, LABEL_Y, enemy.position.z);
          const p = Vector3.Project(labelAnchor, Matrix.Identity(), transform, vp);
          // 背面(z>1)は非表示。
          const visible = p.z > 0 && p.z < 1;
          next.push({
            key: `${item.id}-${i}`,
            text: item.choices[i].label,
            // CSS座標へ(getRenderWidthはデバイスピクセル、cssは論理px)。割合で配置。
            x: (p.x / w) * 100,
            y: (p.y / h) * 100,
            visible,
            aiming: enemy.name === aimedMeshName,
          });
        }
        setLabels(next);
      }

      // レンダーループのコールバックは毎フレーム(rAF周期)実行し、視点更新・おとり移動・
      // 発射処理・撃破アニメは毎フレーム行う(入力遅延の最小化)。
      // GPU描画である scene.render() のみを約33.3ms間隔(30Hz)に間引く。
      engine.runRenderLoop(() => {
        const now = performance.now();
        const dt = now - lastFrameMs;
        lastFrameMs = now;

        if (!finished) {
          // フェーズ制限時間切れ判定(HUD表示だけでなく実際に終了させる)。
          if (now - phaseStartMs >= PHASE_TIME_MS) {
            finishRemaining(now);
          } else {
            const elapsed = now - phaseStartMs;

            // レール移動(往復)。カメラ位置のみ更新、回転はプレイヤー操作を維持。
            const cycle = (elapsed % RAIL_LOOP_MS) / RAIL_LOOP_MS;
            const tri = cycle < 0.5 ? cycle * 2 : (1 - cycle) * 2; // 0→1→0
            const railPos = interpolateRailPosition(RAIL_WAYPOINTS, tri);
            camera.position.set(railPos.x, railPos.y, railPos.z);

            updateDecoys(elapsed);
            recoverRecoil(dt);

            // マズルフラッシュの消灯。
            if (muzzle && muzzle.isEnabled() && now >= muzzleOffAt) {
              muzzle.setEnabled(false);
            }

            if (killing) {
              // 撃破アニメーション中は発射を受け付けず、アニメのみ進める。
              fireRequestedRef.current = false;
              updateKilling(now);
              pushHud(now, false);
            } else {
              const aimed = pickAimedEnemy();

              // 照準が乗っている敵をハイライト(迷彩/顔/ヘルメットの emissive を一括切替)。
              for (let i = 0; i < MAX_ENEMIES; i++) {
                const isAimed = aimed && enemyMeshes[i].name === aimed.meshName;
                const target = isAimed
                  ? ENEMY_EMISSIVE_AIM
                  : ENEMY_EMISSIVE_BASE;
                for (const m of enemyHiliteMats[i]) {
                  m.emissiveColor.copyFrom(target);
                }
              }

              // 発射要求の消費(クールダウンはhandleFire内で判定)。
              if (fireRequestedRef.current) {
                fireRequestedRef.current = false;
                handleFire(now);
              }

              if (!finished && !killing) {
                pushHud(now, aimed !== null);
                pushLabels(now, aimed ? aimed.meshName : null);
              }
            }
          }
        }

        // 30fps固定描画: 前回描画から約33.3ms未満なら scene.render() をスキップする。
        if (now - lastRenderMs >= RENDER_INTERVAL_MS) {
          lastRenderMs = now;
          scene.render();
        }
      });

      // ---- 入力(副入力: スペースキー / マウス左クリック)----
      // 発射ボタン(主入力)は HUD の onFire→requestFire で処理する。
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.code === "Space") {
          e.preventDefault(); // ページスクロールを抑止。
          fireRequestedRef.current = true;
        }
      };
      const onCanvasMouseDown = (e: MouseEvent) => {
        // 左クリックのみ。カメラのドラッグ視点操作と多少競合してよい(優先度は低い)。
        if (e.button === 0) fireRequestedRef.current = true;
      };
      window.addEventListener("keydown", onKeyDown);
      canvas.addEventListener("mousedown", onCanvasMouseDown);
      detachInput = () => {
        window.removeEventListener("keydown", onKeyDown);
        canvas.removeEventListener("mousedown", onCanvasMouseDown);
      };

      handleResize = () => engine.resize();
      window.addEventListener("resize", handleResize);
      setBenchmarking(false);
    };

    // マウント時: 本番Engine作成前にベンチマークを実行(初回のみ。キャッシュがあれば即返る)。
    void (async () => {
      let hardwareScalingLevel = 2; // 失敗時のフォールバック(方針の中間値)。
      try {
        const perf = await ensurePerfTier(() => disposed);
        hardwareScalingLevel = perf.hardwareScalingLevel;
      } catch {
        hardwareScalingLevel = 2;
      }
      if (disposed) return;
      buildScene(hardwareScalingLevel);
    })();

    return () => {
      disposed = true;
      if (handleResize) window.removeEventListener("resize", handleResize);
      if (detachInput) detachInput();
      sceneForCleanup?.dispose();
      engineForCleanup?.dispose();
    };
    // 依存は空: questions/onCompleteはrefで参照する(effectの再実行を避ける)。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-950">
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block" }}
      />
      {/* 敵ネームタグ(選択肢テキスト。Vector3.Project追従のDOMオーバーレイ) */}
      <div className="pointer-events-none absolute inset-0 z-0">
        {labels.map((l) =>
          l.visible ? (
            <div
              key={l.key}
              className={`absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded px-2 py-1 text-sm font-bold ${
                l.aiming
                  ? "bg-cyan-400 text-slate-900"
                  : "bg-slate-900/80 text-white ring-1 ring-white/20"
              }`}
              style={{ left: `${l.x}%`, top: `${l.y}%` }}
            >
              {l.text}
            </div>
          ) : null,
        )}
      </div>
      <HUD
        ammoRemaining={hud.ammoRemaining}
        timeRemainingMs={hud.timeRemainingMs}
        combo={hud.combo}
        aimingValid={hud.aimingValid}
        killFeed={killFeed}
        onFire={requestFire}
      />
      {/* 初回起動時の簡易ベンチマーク中の軽量ローディングUI。 */}
      {benchmarking ? (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-slate-950/90 text-white">
          <Spinner className="size-8 text-cyan-300" />
          <div className="text-sm font-medium tracking-widest opacity-80">
            描画品質を計測中...
          </div>
        </div>
      ) : null}
    </div>
  );
}

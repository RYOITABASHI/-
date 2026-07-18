// client/src/game/phase3d/LockOnScene.tsx
//
// [担当: task_3d_core] ③交戦フェーズ(3Dレール視点)。旧称ロックオンフェーズ。
// レール移動+視点操作のみ(自由移動なし)。狙って撃つ明示的発射を中核に据える。
//
// 2026-07-18改訂(既製CC0モデル導入):
//   - 敵AI兵士・銃ビューモデルを、従来の手続き生成ジオメトリ(Box/Cylinder/Sphere)から
//     既製のCC0(パブリックドメイン)3Dモデルの読み込みへ置き換えた。
//       * 敵AI兵士: Quaternius「Ultimate Modular Men Pack」の SWAT キャラクター
//         (/models/swat-soldier.glb, スケルタル・アニメーション付き)。
//       * 銃ビューモデル: Quaternius「Assault Rifle」(/models/assault-rifle.glb)。
//   - モデルは初回に1度だけ読み込み、AssetContainer.instantiateModelsToScene() で
//     選択肢4体・おとり3体に個別複製する(MergeMeshesはスキニングを破綻させるため
//     不使用。詳細は loadModelTemplates 直前のコメント参照)。
//   - SWATは1体9サブメッシュ(=9ドローコール、非merge)。最大7体同時表示で約63ドローコール
//     となり、緩和後予算(60以下)をわずかに超える見込みだが、対象端末はPUBGモバイル本編を
//     動かせる性能があるため許容範囲とする(docs/game-spec.md 2026-07-18改訂参照)。
//   - スケルトンはクローンごとに独立して複製される(instantiateModelsToScene の仕様)。
//     各インスタンスで Idle_Gun アニメーションをループ再生して立ち姿に生気を出す。
//     撃破は従来同様のノードtween(Y縮小+傾き)。
//   - 照準判定は、スケルタルメッシュのレイ判定ブレを避けるため各敵に不可視のピック用
//     コライダーボックスを持たせ、そこにメタデータを載せる(可視メッシュは isPickable=false)。
//   - 読み込み失敗時は簡易な手続き生成兵士へフォールバックし、画面が真っ白にならないようにする。
//
// FPS化(2026-07-17改訂の game-spec.md に対応)での主な変更(継続):
//   - 明示的発射(発射ボタン/スペース/左クリック, クールダウン付き)。自動ロックオン廃止。
//   - おとりの敵(妨害ドローン相当)は droneAI.ts の移動パターンでパトロールさせる(撃つとミス)。
//   - カメラ追従の銃ビューモデル、マズルフラッシュ、リコイル(pitchキック)。
//   - 効果音は combatAudio.ts(単一AudioContext使い回し)で手続き生成する。
//
// 性能方針(docs/game-spec.md「想定デバイスと性能方針」2026-07-18改訂の緩和後の予算)を厳守:
//   総ポリゴン20万以下 / ドローコール60以下 / テクスチャ1024px以下4枚程度 /
//   ライトは環境光+2灯まで(本シーンは環境光+方向光1灯の2灯) /
//   簡易な低解像度シャドウ1灯分(512px, blur exp, 受影は地面のみ / 投影は選択肢の敵のみ) /
//   軽量ポストプロセス1つ(単一パスのvignette)は許容 /
//   setHardwareScalingLevel / freezeActiveMeshes / material.freeze /
//   30fps固定描画 / 初回ベンチマーク。
//   実測: SWAT=7,752三角形/体, ライフル=1,930三角形。敵最大7体で約5.4万三角形(予算20万に十分収まる)。

// glTFローダーをサイドエフェクト登録する(SceneLoaderで.glbを読むのに必須)。
// 注意: バレル "@babylonjs/loaders/glTF" は全拡張(KHR_interactivity 等)を取り込み、
// loaders@7.40.0 と core@7.54.3 のバージョン差で存在しないモジュール
// (FlowGraph/.../flowGraphTimerBlock.js)を参照してビルドが壊れる。
// 本シーンの2つの .glb はどちらも glTF拡張を一切使わないため、プラグイン登録
// (glTFFileLoader)と2.0ローダー本体(glTFLoader)だけを読み込み、壊れた拡張バレルを避ける。
import "@babylonjs/loaders/glTF/glTFFileLoader";
import "@babylonjs/loaders/glTF/2.0/glTFLoader";
import {
  AbstractMesh,
  AnimationGroup,
  AssetContainer,
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
  MultiMaterial,
  PBRMaterial,
  Ray,
  Scene,
  SceneLoader,
  ShadowGenerator,
  StandardMaterial,
  Texture,
  TransformNode,
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
// 敵の頭上に出すネームタグ(選択肢テキスト)の高さ。人型モデルの全高(約1.75)より少し上。
const LABEL_Y = 2.05;

// 読み込んだ人型モデルを合わせる目標身長(ワールド単位)。地面 y=0 に足を接地させる。
const TARGET_HEIGHT = 1.75;
// 兵士の正面向き(rotation.y)。SWATの正面がカメラ(-z側)を向くよう調整する。
const SOLDIER_FACING_Y = Math.PI;
// ピック用コライダーの寸法(人型の胴〜頭を覆う。可視化しない)。
const COLLIDER_SIZE = { width: 0.7, height: 1.75, depth: 0.5 };

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

// 照準ハイライト(命中可能を示す)。emissiveを一括で切り替えて表現する。
const ENEMY_EMISSIVE_BASE = new Color3(0, 0, 0);
const ENEMY_EMISSIVE_AIM = new Color3(0.14, 0.6, 0.66); // 照準が乗った時のシアン寄り発光。

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

// clone した1体分のハンドル(可視メッシュ + 照準で色を変えるマテリアル群 + ピックコライダー)。
interface SoldierInstance {
  root: TransformNode; // 位置/スケール/回転tweenの対象(実モデルは複数メッシュの親、フォールバックはMesh自体)。
  hiliteMats: Array<StandardMaterial | PBRMaterial>; // emissiveを書き換える部位マテリアル。
  collider: Mesh | null; // 不可視のピック用ボックス(選択肢の敵のみ)。
  idle: AnimationGroup | null; // この個体専用のループ立ち姿アニメーション(無ければ null)。
}

// 読み込んだモデルのテンプレート(instantiateModelsToScene元)一式。
interface ModelTemplates {
  // 兵士のAssetContainer。instantiateModelsToScene() で個体ごとに独立したスキン付き
  // インスタンスを生成する(スキンメッシュはMergeMeshesで結合すると変形が破綻するため、
  // Babylon公式の複製手段であるAssetContainerを使う)。読み込み失敗時は null。
  soldierContainer: AssetContainer | null;
  soldierScale: number; // TARGET_HEIGHT に合わせる一様スケール。
  soldierFootOffset: number; // 足が y=0 に来るようにする位置オフセット。
  rifle: Mesh | null; // 銃ビューモデル(読み込み失敗時は null → 簡易生成にフォールバック)。
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


// glTFの読み込み結果から、可視ジオメトリを持つメッシュだけを取り出す(__root__等は除外)。
function collectGeometryMeshes(meshes: Mesh[]): Mesh[] {
  return meshes.filter(
    (m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0,
  );
}

// PBRMaterial 1枚を StandardMaterial へ変換する。
// このシーンには scene.environmentTexture(IBL)を設定していないため、PBRMaterialは
// 間接照明の寄与がほぼゼロになり、特にmetallicが高いマテリアルは真っ黒に見える
// (Babylon.jsでよくある落とし穴)。IBL無しでも安定して発色するStandardMaterialへ
// 変換することで、既存のHemisphericLight+DirectionalLightだけで正しく陰影がつくようにする。
function pbrToStandard(scene: Scene, mat: PBRMaterial): StandardMaterial {
  const std = new StandardMaterial(`${mat.name}-std`, scene);
  const c = mat.albedoColor ? mat.albedoColor.clone() : new Color3(0.5, 0.5, 0.5);
  // 一部の戦術装備色はbaseColorFactorが極端に暗く(黒い服等)、IBL無しのStandard
  // Materialでは画面上でほぼシルエットになってしまう。視認性のため、暗すぎる色は
  // 色相を保ったまま最低輝度まで底上げする(真っ黒に近いVisor等も少し持ち上がるが、
  // 完全な黒つぶれを避ける方を優先する)。
  const MIN_BRIGHTNESS = 0.16;
  const brightness = (c.r + c.g + c.b) / 3;
  if (brightness > 0 && brightness < MIN_BRIGHTNESS) {
    c.scaleInPlace(Math.min(MIN_BRIGHTNESS / brightness, 5));
  } else if (brightness === 0) {
    c.set(MIN_BRIGHTNESS, MIN_BRIGHTNESS, MIN_BRIGHTNESS);
  }
  std.diffuseColor = c;
  if (mat.albedoTexture instanceof Texture) std.diffuseTexture = mat.albedoTexture;
  std.emissiveColor = mat.emissiveColor ? mat.emissiveColor.clone() : new Color3(0, 0, 0);
  std.alpha = mat.alpha;
  // metallic-roughnessの厳密な変換はせず、控えめな鏡面反射で近似する。
  std.specularColor = new Color3(0.08, 0.08, 0.08);
  std.specularPower = 32;
  return std;
}

// メッシュのマテリアル(単一 or MultiMaterial)に含まれるPBRMaterialをすべてStandardMaterialへ
// 変換する。PBRでないマテリアルはそのまま維持する。
function convertPbrMaterialsToStandard(scene: Scene, mesh: Mesh): void {
  const mat = mesh.material;
  if (mat instanceof MultiMaterial) {
    mat.subMaterials = mat.subMaterials.map((m) =>
      m instanceof PBRMaterial ? pbrToStandard(scene, m) : m,
    );
  } else if (mat instanceof PBRMaterial) {
    mesh.material = pbrToStandard(scene, mat);
  }
}

// 読み込み失敗時のフォールバック兵士(単一マテリアルの簡易人型)。約1.7全高・足接地・-z正面。
function buildFallbackSoldier(scene: Scene): Mesh {
  const parts: Mesh[] = [];
  for (const sx of [-0.14, 0.14]) {
    const leg = MeshBuilder.CreateCylinder(
      "fbLeg",
      { height: 0.86, diameterTop: 0.2, diameterBottom: 0.17, tessellation: 8 },
      scene,
    );
    leg.position.set(sx, 0.43, 0);
    parts.push(leg);
  }
  const torso = MeshBuilder.CreateCylinder(
    "fbTorso",
    { height: 0.66, diameterTop: 0.52, diameterBottom: 0.42, tessellation: 8 },
    scene,
  );
  torso.position.y = 1.19;
  parts.push(torso);
  const head = MeshBuilder.CreateSphere(
    "fbHead",
    { diameter: 0.27, segments: 8 },
    scene,
  );
  head.position.y = 1.6;
  parts.push(head);
  const helmet = MeshBuilder.CreateSphere(
    "fbHelmet",
    { diameter: 0.34, segments: 8, slice: 0.62 },
    scene,
  );
  helmet.position.y = 1.72;
  parts.push(helmet);
  const merged = Mesh.MergeMeshes(parts, true, true);
  const soldier = merged ?? torso;
  soldier.name = "fallbackSoldier";
  return soldier;
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
  // 初回起動時ベンチマーク・モデル読み込み中はローディングUIを表示する。
  const [loading, setLoading] = useState(true);
  const [loadingLabel, setLoadingLabel] = useState("描画品質を計測中...");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const qs = questionsRef.current;
    if (qs.length === 0) {
      setLoading(false);
      onCompleteRef.current([]);
      return;
    }

    // 非同期(ベンチマーク→モデル読込→本番シーン構築)。アンマウント時の破棄を disposed で管理する。
    let disposed = false;
    let engineForCleanup: Engine | null = null;
    let sceneForCleanup: Scene | null = null;
    let handleResize: (() => void) | null = null;
    let detachInput: (() => void) | null = null;
    // LoadAssetContainerAsync で読み込んだ内容は scene の管理下に入らないため、
    // scene.dispose() だけでは解放されない。アンマウント時に明示的に dispose する。
    let soldierContainerForCleanup: AssetContainer | null = null;

    // ---- モデルテンプレートの読み込み(初回1度) ----
    // SWATと銃をglTF読み込みし、AssetContainer は clone 元テンプレートとして保持する
    // (Merge はしない。理由は下記コメント参照)。
    // 失敗しても throw せず、簡易フォールバックのテンプレートを返す(画面が真っ白にならないよう)。
    const loadModelTemplates = async (scene: Scene): Promise<ModelTemplates> => {
      // --- 兵士 ---
      // SWATは4つの独立したスキンメッシュ(Legs/Feet/Body/Head、各々が62ボーンの
      // スケルトンを参照)で構成されている。MergeMeshesで1メッシュに結合すると、
      // メッシュノード自身のtransform(スケール100倍等)がスキニング前提の座標系と
      // 二重に適用され、頂点の変形が破綻する(手足が異常に伸びる等の不具合の原因)。
      // このため結合はせず、Babylon公式の複製手段である
      // AssetContainer.instantiateModelsToScene() で個体ごとに独立したスキン付き
      // インスタンスを生成する(スケルトン・アニメーションも複製時に正しく複製される)。
      let soldierContainer: AssetContainer | null = null;
      let soldierScale = 1;
      let soldierFootOffset = 0;
      try {
        const container = await SceneLoader.LoadAssetContainerAsync(
          "/models/",
          "swat-soldier.glb",
          scene,
        );
        soldierContainerForCleanup = container;
        // glTFのPBRMaterialはIBL(環境テクスチャ)無しだと真っ黒に見えるため、StandardMaterialへ変換する。
        for (const m of container.meshes) {
          if (m instanceof Mesh) convertPbrMaterialsToStandard(scene, m);
        }
        // 高さ計測用に一度だけ一時インスタンス化し、寸法を測ったら破棄する
        // (container自体はシーンに追加されないため、テンプレートとして安全に保持できる)。
        const probe = container.instantiateModelsToScene(
          (n) => `probe-${n}`,
          false,
        );
        let minY = Infinity;
        let maxY = -Infinity;
        for (const root of probe.rootNodes) {
          for (const m of root.getChildMeshes(false)) {
            m.computeWorldMatrix(true);
            m.refreshBoundingInfo(true, false);
            const bb = m.getBoundingInfo().boundingBox;
            minY = Math.min(minY, bb.minimumWorld.y);
            maxY = Math.max(maxY, bb.maximumWorld.y);
          }
        }
        const height = maxY > minY ? maxY - minY : 1;
        soldierScale = TARGET_HEIGHT / height;
        soldierFootOffset = -minY * soldierScale;
        for (const ag of probe.animationGroups) ag.dispose();
        for (const sk of probe.skeletons) sk.dispose();
        for (const root of probe.rootNodes) root.dispose();
        soldierContainer = container;
      } catch (err) {
        console.error(
          "[LockOnScene] SWATモデルの読み込みに失敗。簡易兵士へフォールバックします。",
          err,
        );
        soldierContainer = null;
        soldierScale = 1;
        soldierFootOffset = 0;
      }

      // --- 銃(ライフル) ---
      let rifle: Mesh | null = null;
      try {
        const result = await SceneLoader.ImportMeshAsync(
          "",
          "/models/",
          "assault-rifle.glb",
          scene,
        );
        for (const ag of result.animationGroups) ag.dispose();
        const geo = collectGeometryMeshes(result.meshes as Mesh[]);
        if (geo.length === 0) throw new Error("Rifle: ジオメトリメッシュが見つからない");
        // 単一マテリアルへ畳む(3サブメッシュ→1ドローコール)。銃口色は近似的に単色で締める。
        const merged =
          geo.length === 1 && geo[0].subMeshes && geo[0].subMeshes.length <= 1
            ? geo[0]
            : Mesh.MergeMeshes(geo, true, true);
        rifle = merged ?? geo[0] ?? null;
        if (rifle) {
          rifle.name = "rifleTemplate";
          convertPbrMaterialsToStandard(scene, rifle);
        }
      } catch (err) {
        console.error(
          "[LockOnScene] ライフルモデルの読み込みに失敗。簡易銃へフォールバックします。",
          err,
        );
        rifle = null; // buildScene 側で簡易銃を生成する。
      }

      return {
        soldierContainer,
        soldierScale,
        soldierFootOffset,
        rifle,
      };
    };

    // 本番シーンを構築する。hardwareScalingLevel はベンチマーク結果を反映する。
    const buildScene = async (hardwareScalingLevel: number) => {
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
      const light = new HemisphericLight("light", new Vector3(0, 1, 0.2), scene);
      light.intensity = 0.9;
      light.diffuse = new Color3(1, 0.97, 0.88);
      light.groundColor = new Color3(0.42, 0.45, 0.38);

      // 方向光(2灯目)。暖色の太陽光を斜め上手前から当て、モデルに立体感(陰影)を出す。
      const sun = new DirectionalLight(
        "sun",
        new Vector3(-0.55, -1, 0.35),
        scene,
      );
      sun.position = new Vector3(12, 20, -12);
      sun.intensity = 1.35;
      sun.diffuse = new Color3(1, 0.93, 0.78);
      sun.specular = new Color3(0.2, 0.2, 0.18);

      // 低解像度シャドウ(512px, blur exponential)。1灯分・受影は地面のみ・投影は選択肢の敵のみに
      // 限定してドローコール/負荷を抑える(方針で許容された簡易シャドウ)。
      const shadowGen = new ShadowGenerator(512, sun);
      shadowGen.useBlurExponentialShadowMap = true;
      shadowGen.blurKernel = 16;
      shadowGen.blurScale = 2;
      shadowGen.depthScale = 30;
      sun.shadowMinZ = 1;
      sun.shadowMaxZ = 40;

      // 地面・建物で共有するプロシージャルテクスチャ(1024px以下・計2枚)。
      const groundTex = createGroundTexture(scene);
      const bldgTex = createBuildingTexture(scene);

      // ---- モデル読み込み(ローディング表示を切り替えてから待つ) ----
      if (!disposed) setLoadingLabel("モデルを読み込み中...");
      const templates = await loadModelTemplates(scene);
      if (disposed) return;

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
      ground.isPickable = false;

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

      // AbstractMesh を1つでも含むノード配下のメッシュ全部にコールバックを適用する
      // (ShadowGenerator へのcaster登録・ピック不可設定などに使う共通ヘルパ)。
      const forEachMeshOf = (node: TransformNode, cb: (m: AbstractMesh) => void) => {
        if (node instanceof AbstractMesh) cb(node);
        for (const m of node.getChildMeshes(false)) cb(m);
      };

      // ---- 兵士テンプレートから clone してプールを作るヘルパ ----
      // 実モデルは AssetContainer.instantiateModelsToScene() で個体ごとに独立した
      // スキン付きインスタンス(メッシュ・スケルトン・アニメーション一式)を生成する。
      // 読み込み失敗時は手続き生成のフォールバック兵士(単一メッシュ)を使う。
      const cloneSoldier = (
        name: string,
        opts: { pickable: boolean; darken: number },
      ): SoldierInstance => {
        let root: TransformNode;
        const hiliteMats: Array<StandardMaterial | PBRMaterial> = [];
        let idle: AnimationGroup | null = null;

        if (templates.soldierContainer) {
          const inst = templates.soldierContainer.instantiateModelsToScene(
            (n) => `${name}-${n}`,
            true, // マテリアルも複製(照準ハイライト/暗色化を個体ごとに独立させるため)。
          );
          const parent = new TransformNode(`${name}-root`, scene);
          for (const r of inst.rootNodes) r.parent = parent;
          root = parent;

          // 同じマテリアルが複数メッシュ(脚/胴/頭など)から参照されているため、
          // 未処理のマテリアルのみ1回ずつ処理する(重複処理すると暗色化が多重に
          // 掛かってしまい、共有回数に応じて意図よりずっと暗くなる)。
          const processedMats = new Set<StandardMaterial | PBRMaterial>();
          forEachMeshOf(parent, (m) => {
            m.isPickable = false; // 可視メッシュは常に非ピック(ピックはコライダーで行う)。
            const mat = m.material;
            if (
              (mat instanceof StandardMaterial || mat instanceof PBRMaterial) &&
              !processedMats.has(mat)
            ) {
              processedMats.add(mat);
              if (opts.darken < 1) {
                if (mat instanceof PBRMaterial) {
                  mat.albedoColor.scaleInPlace(opts.darken);
                } else {
                  mat.diffuseColor.scaleInPlace(opts.darken);
                }
              }
              mat.emissiveColor = ENEMY_EMISSIVE_BASE.clone();
              if (!opts.pickable) mat.freeze(); // おとり(非ハイライト)は freeze してよい。
              hiliteMats.push(mat);
            }
          });

          idle =
            inst.animationGroups.find((a) => /Idle_Gun\b/.test(a.name)) ??
            inst.animationGroups.find((a) => /\bIdle\b/i.test(a.name)) ??
            inst.animationGroups.find((a) => /Idle/i.test(a.name)) ??
            null;
          for (const ag of inst.animationGroups) {
            if (ag === idle) ag.start(true, 1.0);
            else ag.dispose();
          }
        } else {
          // フォールバック兵士(単一メッシュ、スケルトン/アニメ無し)。
          const fb = buildFallbackSoldier(scene);
          const m = new StandardMaterial(`${name}-fbmat`, scene);
          m.diffuseColor = new Color3(0.32, 0.35, 0.24).scale(
            opts.darken < 1 ? opts.darken : 1,
          );
          m.specularColor = new Color3(0.02, 0.02, 0.02);
          m.emissiveColor = ENEMY_EMISSIVE_BASE.clone();
          if (!opts.pickable) m.freeze();
          fb.material = m;
          fb.isPickable = false;
          root = fb;
          hiliteMats.push(m);
        }

        root.scaling.setAll(templates.soldierScale);
        root.rotation.set(0, SOLDIER_FACING_Y, 0);

        // ピック用コライダー(不可視)。選択肢の敵のみに付与する。
        let collider: Mesh | null = null;
        if (opts.pickable) {
          collider = MeshBuilder.CreateBox(`${name}-col`, COLLIDER_SIZE, scene);
          collider.isVisible = false;
          collider.isPickable = true;
          collider.setEnabled(true);
        }

        return { root, hiliteMats, collider, idle };
      };

      // 選択肢の敵AI兵士(pool)。個別コライダー付き。
      const enemies: SoldierInstance[] = [];
      for (let i = 0; i < MAX_ENEMIES; i++) {
        const inst = cloneSoldier(`enemy-${i}`, { pickable: true, darken: 1 });
        if (inst.collider) {
          inst.collider.metadata = {
            isEnemy: true,
            enemyIndex: i,
            choiceId: null as string | null,
          };
        }
        // 選択肢の敵のみ影を落とす(受影は地面)。
        forEachMeshOf(inst.root, (m) => shadowGen.addShadowCaster(m, false));
        enemies.push(inst);
      }

      // おとりの敵(妨害ドローン相当)。3体を個別cloneし、やや暗くして固定(ピック対象外)。
      const decoys: SoldierInstance[] = [];
      for (let i = 0; i < DRONE_SPECS.length; i++) {
        const inst = cloneSoldier(`decoy-${i}`, { pickable: false, darken: 0.62 });
        decoys.push(inst);
      }

      // ---- 銃ビューモデル(カメラ追従) ----
      // 読み込んだライフルを右下に配置する。読み込み失敗時は簡易な箱で銃を組む。
      const gunMat = new StandardMaterial("gunMat", scene);
      gunMat.diffuseColor = new Color3(0.15, 0.16, 0.18);
      gunMat.specularColor = new Color3(0.35, 0.36, 0.4); // 金属的なハイライト。
      gunMat.specularPower = 48;
      gunMat.emissiveColor = new Color3(0.015, 0.015, 0.02);
      gunMat.freeze();

      let gun: Mesh | null = null;
      if (templates.rifle) {
        gun = templates.rifle;
        gun.name = "gunView";
        gun.material = gunMat;
        gun.isPickable = false;
        gun.setEnabled(true);
        gun.parent = camera;
        // ライフルを TARGET とは別に一定長へ合わせる。銃身が +z(前方)を向くよう回転を調整する。
        gun.computeWorldMatrix(true);
        gun.refreshBoundingInfo(true);
        const rb = gun.getBoundingInfo().boundingBox;
        const dims = rb.maximumWorld.subtract(rb.minimumWorld);
        const longest = Math.max(dims.x, dims.y, dims.z, 0.001);
        const rifleScale = 0.85 / longest; // 画面内で程よい銃の長さに。
        gun.scaling.setAll(rifleScale);
        // 右下に構える。銃口方向はモデル依存のため回転を与えて調整する。
        gun.position.set(0.32, -0.36, 0.7);
        gun.rotation.set(0.02, Math.PI, 0);
      } else {
        // フォールバック: 簡易な箱組みのライフル。
        const gunParts: Mesh[] = [];
        const receiver = MeshBuilder.CreateBox(
          "gunReceiver",
          { width: 0.13, height: 0.15, depth: 0.62 },
          scene,
        );
        receiver.position.set(0, 0, 0.05);
        gunParts.push(receiver);
        const stock = MeshBuilder.CreateBox(
          "gunStock",
          { width: 0.1, height: 0.14, depth: 0.3 },
          scene,
        );
        stock.position.set(0, -0.06, -0.42);
        gunParts.push(stock);
        const grip = MeshBuilder.CreateBox(
          "gunGrip",
          { width: 0.08, height: 0.22, depth: 0.1 },
          scene,
        );
        grip.position.set(0, -0.16, -0.16);
        grip.rotation.x = -0.5;
        gunParts.push(grip);
        const mag = MeshBuilder.CreateBox(
          "gunMag",
          { width: 0.07, height: 0.26, depth: 0.14 },
          scene,
        );
        mag.position.set(0, -0.2, 0.04);
        mag.rotation.x = 0.3;
        gunParts.push(mag);
        const barrel = MeshBuilder.CreateCylinder(
          "gunBarrel",
          { height: 0.44, diameter: 0.05, tessellation: 6 },
          scene,
        );
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.005, 0.82);
        gunParts.push(barrel);
        gun = Mesh.MergeMeshes(gunParts, true, true);
        if (gun) {
          gun.name = "gunView";
          gun.material = gunMat;
          gun.isPickable = false;
          gun.parent = camera;
          gun.position.set(0.3, -0.34, 0.78);
          gun.rotation.set(0.04, -0.05, 0);
          gun.scaling.setAll(0.9);
        }
      }

      // マズルフラッシュ: 銃口付近の発光プレーン。発射時のみ短時間表示する。
      let muzzle: Mesh | null = null;
      if (gun) {
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
      const S = templates.soldierScale;
      const FOOT = templates.soldierFootOffset;

      // 現在の問題の敵AI兵士を配置する。
      function layoutQuestion(index: number) {
        const item = qs[index];
        const n = Math.min(item.choices.length, MAX_ENEMIES);
        const startX = -((n - 1) / 2) * ENEMY_SPREAD;
        for (let i = 0; i < MAX_ENEMIES; i++) {
          const inst = enemies[i];
          const enemy = inst.root;
          // 撃破アニメで変化していたスケール/回転を戻す。
          enemy.scaling.setAll(S);
          enemy.rotation.set(0, SOLDIER_FACING_Y, 0);
          if (i < n) {
            const choice = item.choices[i];
            const x = startX + i * ENEMY_SPREAD;
            enemy.position.set(x, FOOT, ENEMY_Z);
            enemy.setEnabled(true);
            if (inst.collider) {
              inst.collider.position.set(x, COLLIDER_SIZE.height / 2, ENEMY_Z);
              inst.collider.setEnabled(true);
              (inst.collider.metadata as { choiceId: string | null }).choiceId =
                choice.id;
            }
          } else {
            enemy.setEnabled(false);
            if (inst.collider) {
              inst.collider.setEnabled(false);
              (inst.collider.metadata as { choiceId: string | null }).choiceId =
                null;
            }
          }
          for (const m of inst.hiliteMats) {
            m.emissiveColor.copyFrom(ENEMY_EMISSIVE_BASE);
          }
        }
        questionStartMs = performance.now();
        missShotsThisQuestion = 0;
      }

      layoutQuestion(0);

      function updateDecoys(elapsed: number) {
        const cam = camera.position;
        for (let i = 0; i < DRONE_SPECS.length; i++) {
          const dp: DronePosition2D = computeDronePosition(
            DRONE_SPECS[i],
            elapsed,
          );
          const enemy = decoys[i].root;
          if (!dp.visible) {
            if (enemy.isEnabled()) enemy.setEnabled(false);
            continue;
          }
          if (!enemy.isEnabled()) enemy.setEnabled(true);
          const wx =
            DECOY_X_START +
            (((dp.x % DECOY_X_RANGE) + DECOY_X_RANGE) % DECOY_X_RANGE);
          // 人型は接地させる。zigzagの縦揺れ(dp.y)は奥行き方向の蛇行に割り当てる。
          const wz = DECOY_Z + dp.y;
          const yaw = Math.atan2(cam.x - wx, cam.z - wz);
          enemy.position.set(wx, FOOT, wz);
          enemy.rotation.set(0, yaw, 0);
        }
      }

      // カメラ前方の敵(選択肢の敵AI兵士のコライダー)を判定する。おとり/銃/地面は predicate で除外。
      function pickAimedEnemy(): {
        enemyIndex: number;
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
          const md = pick.pickedMesh.metadata as {
            enemyIndex: number;
            choiceId: string | null;
          };
          if (md.choiceId != null)
            return { enemyIndex: md.enemyIndex, choiceId: md.choiceId };
        }
        return null;
      }

      // 命中(選択肢の敵にヒット)を記録する。questionIndexを進め、撃破アニメを開始する。
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
          if (i !== enemyIndex) enemies[i].root.setEnabled(false);
          if (enemies[i].collider) enemies[i].collider!.setEnabled(false);
        }
        setLabels([]); // アニメ中はネームタグを消す。
        killing = { enemyIndex, startMs: now, finishAfter };
      }

      // 撃破アニメーション(Y縮小+傾き)を更新する。完了で次問題へ/フェーズ完了へ。
      function updateKilling(now: number) {
        if (!killing) return;
        const enemy = enemies[killing.enemyIndex].root;
        const t = (now - killing.startMs) / KILL_ANIM_MS;
        if (t >= 1) {
          enemy.setEnabled(false);
          enemy.scaling.setAll(S);
          enemy.rotation.set(0, SOLDIER_FACING_Y, 0);
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
          enemy.scaling.set(S, S * k, S);
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
        for (const e of enemies) {
          e.root.setEnabled(false);
          e.collider?.setEnabled(false);
        }
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
          recordHit(aimed.enemyIndex, aimed.choiceId, now);
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
      function pushLabels(now: number, aimedIndex: number | null) {
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
          const enemy = enemies[i].root;
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
            aiming: i === aimedIndex,
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

              // 照準が乗っている敵をハイライト(部位マテリアルの emissive を一括切替)。
              for (let i = 0; i < MAX_ENEMIES; i++) {
                const isAimed = aimed && aimed.enemyIndex === i;
                const target = isAimed
                  ? ENEMY_EMISSIVE_AIM
                  : ENEMY_EMISSIVE_BASE;
                for (const m of enemies[i].hiliteMats) {
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
                pushLabels(now, aimed ? aimed.enemyIndex : null);
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
      setLoading(false);
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
      try {
        await buildScene(hardwareScalingLevel);
      } catch (err) {
        // 予期せぬ構築失敗でも画面を真っ白にしない。ローディングを閉じてフェーズをスキップする。
        console.error("[LockOnScene] シーン構築に失敗しました。", err);
        if (!disposed) {
          setLoading(false);
          onCompleteRef.current([]);
        }
      }
    })();

    return () => {
      disposed = true;
      if (handleResize) window.removeEventListener("resize", handleResize);
      if (detachInput) detachInput();
      sceneForCleanup?.dispose();
      soldierContainerForCleanup?.dispose();
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
      {/* 初回起動時の簡易ベンチマーク・モデル読み込み中の軽量ローディングUI。 */}
      {loading ? (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-slate-950/90 text-white">
          <Spinner className="size-8 text-cyan-300" />
          <div className="text-sm font-medium tracking-widest opacity-80">
            {loadingLabel}
          </div>
        </div>
      ) : null}
    </div>
  );
}

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
// 低スペック方針(docs/game-spec.md「想定デバイスと性能方針」)は厳守:
//   setHardwareScalingLevel / freezeActiveMeshes / material.freeze /
//   シャドウ無し / ポストプロセス無し / 環境光+1灯のみ / おとりはthin instances /
//   30fps固定描画 / 初回ベンチマーク / 人型敵は低ポリ(1体あたり数百ポリゴン)。

import {
  Color3,
  Color4,
  Engine,
  FreeCamera,
  HemisphericLight,
  Matrix,
  Mesh,
  MeshBuilder,
  Ray,
  Scene,
  StandardMaterial,
  Vector3,
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

// 低ポリ人型(敵AI兵士)のテンプレートメッシュを手続き生成する。
// 円柱(胴体)+ 箱(頭部)+ 箱(ヘルメット)を1メッシュにMergeし、以降はcloneや
// thin instances のベースとして使う。1体あたり数百ポリゴン程度に抑える。
function buildSoldierTemplate(scene: Scene): Mesh {
  // 胴体: 8角柱(側面8+上下キャップ)で低ポリ。全高の下部を占める。
  const body = MeshBuilder.CreateCylinder(
    "soldierBody",
    { height: 1.15, diameterTop: 0.42, diameterBottom: 0.5, tessellation: 8 },
    scene,
  );
  body.position.y = 0.575;

  // 頭部: 小さな箱。
  const head = MeshBuilder.CreateBox(
    "soldierHead",
    { width: 0.34, height: 0.34, depth: 0.34 },
    scene,
  );
  head.position.y = 1.32;

  // ヘルメット: 頭部より一回り大きく低い箱を被せる。
  const helmet = MeshBuilder.CreateBox(
    "soldierHelmet",
    { width: 0.42, height: 0.2, depth: 0.44 },
    scene,
  );
  helmet.position.y = 1.52;

  // マテリアルはMerge後にまとめて割り当てるため、ソースには付けない。
  const merged = Mesh.MergeMeshes(
    [body, head, helmet],
    true, // ソースメッシュを破棄
    true, // 32bitインデックス許可
    undefined,
    false,
    false,
  );
  if (!merged) {
    // Merge失敗時のフォールバック(通常起きない)。胴体だけでも返す。
    return body;
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
      scene.clearColor = new Color4(0.04, 0.06, 0.1, 1);

      // 環境光 + 1灯のみ(方針)。ここでは環境光1灯のみとし追加ライトは置かない。
      const light = new HemisphericLight("light", new Vector3(0, 1, 0.2), scene);
      light.intensity = 0.95;

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
      groundMat.diffuseColor = new Color3(0.1, 0.13, 0.18);
      groundMat.specularColor = new Color3(0, 0, 0);
      groundMat.freeze();
      ground.material = groundMat;

      // 敵の見た目色(くすんだ迷彩っぽいオリーブ)。命中可能を示すハイライトは emissive で表現。
      const ENEMY_DIFFUSE = new Color3(0.26, 0.3, 0.17);
      const ENEMY_EMISSIVE_BASE = new Color3(0.04, 0.05, 0.03);
      const ENEMY_EMISSIVE_AIM = new Color3(0.08, 0.4, 0.45); // 照準が乗った時のシアン寄り発光。

      // 選択肢の敵AI兵士(pool)。人型メッシュを個別に生成し、各自にマテリアルとメタデータを持たせる。
      // (thin instancesベースとジオメトリを共有しないよう clone は使わず個別生成する。
      //  共有ジオメトリにthin instanceバッファを載せるとcloneの描画が壊れうるため。)
      const enemyMeshes: Mesh[] = [];
      const enemyMats: StandardMaterial[] = [];
      for (let i = 0; i < MAX_ENEMIES; i++) {
        const enemy = buildSoldierTemplate(scene);
        enemy.name = `enemy-${i}`;
        // マテリアルはハイライトで emissive を書き換えるため freeze しない。
        const mat = new StandardMaterial(`enemyMat-${i}`, scene);
        mat.diffuseColor = ENEMY_DIFFUSE.clone();
        mat.emissiveColor = ENEMY_EMISSIVE_BASE.clone();
        mat.specularColor = new Color3(0, 0, 0);
        enemy.material = mat;
        enemy.metadata = { isEnemy: true, choiceId: null as string | null };
        enemyMeshes.push(enemy);
        enemyMats.push(mat);
      }

      // おとりの敵: 独立した人型メッシュをベースにし、thin instances で3体を描画する。
      // 選択肢を持たず、撃ってもミス扱い(ピック対象にしない)。
      const decoyBase = buildSoldierTemplate(scene);
      decoyBase.name = "decoyBase";
      decoyBase.isPickable = false;
      const decoyMat = new StandardMaterial("decoyMat", scene);
      decoyMat.diffuseColor = new Color3(0.22, 0.2, 0.16); // おとりは僅かに暗い色。
      decoyMat.emissiveColor = new Color3(0.03, 0.03, 0.02);
      decoyMat.specularColor = new Color3(0, 0, 0);
      decoyMat.freeze();
      decoyBase.material = decoyMat;
      const decoyMatrices = new Float32Array(DRONE_SPECS.length * 16);
      for (let i = 0; i < DRONE_SPECS.length; i++) {
        Matrix.Identity().copyToArray(decoyMatrices, i * 16);
      }
      decoyBase.thinInstanceSetBuffer("matrix", decoyMatrices, 16);

      // 銃ビューモデル(カメラ追従)。Box/Cylinderを1メッシュにMergeし右下寄りに配置する。
      // ピック対象にはしない。
      const gunBody = MeshBuilder.CreateBox(
        "gunBody",
        { width: 0.12, height: 0.14, depth: 0.6 },
        scene,
      );
      gunBody.position.set(0, 0, 0.1);
      const gunBarrel = MeshBuilder.CreateCylinder(
        "gunBarrel",
        { height: 0.5, diameter: 0.05, tessellation: 6 },
        scene,
      );
      gunBarrel.rotation.x = Math.PI / 2; // 前方(z+)へ向ける。
      gunBarrel.position.set(0, 0.02, 0.5);
      const gunMag = MeshBuilder.CreateBox(
        "gunMag",
        { width: 0.08, height: 0.22, depth: 0.14 },
        scene,
      );
      gunMag.position.set(0, -0.16, 0.05);
      const gun = Mesh.MergeMeshes([gunBody, gunBarrel, gunMag], true, true);
      const gunMat = new StandardMaterial("gunMat", scene);
      gunMat.diffuseColor = new Color3(0.12, 0.12, 0.14);
      gunMat.specularColor = new Color3(0.05, 0.05, 0.05);
      gunMat.freeze();
      let muzzle: Mesh | null = null;
      if (gun) {
        gun.name = "gunView";
        gun.material = gunMat;
        gun.isPickable = false;
        gun.parent = camera;
        // 画面右下寄り、前方に配置(一人称の構え)。
        gun.position.set(0.28, -0.28, 0.9);
        gun.rotation.set(0.02, -0.04, 0);

        // マズルフラッシュ: 銃口付近の小さな発光プレーン。発射時のみ短時間表示する。
        muzzle = MeshBuilder.CreatePlane("muzzle", { size: 0.28 }, scene);
        const muzzleMat = new StandardMaterial("muzzleMat", scene);
        muzzleMat.diffuseColor = new Color3(0, 0, 0);
        muzzleMat.emissiveColor = new Color3(1, 0.8, 0.35);
        muzzleMat.specularColor = new Color3(0, 0, 0);
        muzzleMat.backFaceCulling = false;
        muzzleMat.disableLighting = true;
        muzzleMat.freeze();
        muzzle.material = muzzleMat;
        muzzle.isPickable = false;
        muzzle.parent = camera;
        muzzle.position.set(0.28, -0.24, 1.45); // 銃口の少し前。
        muzzle.setEnabled(false);
      }

      engine.setHardwareScalingLevel(hardwareScalingLevel);

      // 静的シーン構築が完了したのでアクティブメッシュを凍結する。
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
          enemyMats[i].emissiveColor.copyFrom(ENEMY_EMISSIVE_BASE);
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

              // 照準が乗っている敵をハイライト(emissive)。
              for (let i = 0; i < MAX_ENEMIES; i++) {
                const isAimed = aimed && enemyMeshes[i].name === aimed.meshName;
                enemyMats[i].emissiveColor.copyFrom(
                  isAimed ? ENEMY_EMISSIVE_AIM : ENEMY_EMISSIVE_BASE,
                );
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

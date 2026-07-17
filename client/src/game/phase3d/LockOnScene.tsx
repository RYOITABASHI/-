// client/src/game/phase3d/LockOnScene.tsx
//
// [担当: task_3d_core] ③ロックオンフェーズ(3Dレール視点)。
// レール移動+視点操作のみ(自由移動なし)、照準保持ロックオン、妨害ドローン(thin
// instances+ビルボード)、DOMオーバーレイHUD/ラベルで構成する。
// 低スペック方針(docs/game-spec.md「想定デバイスと性能方針」)を適用:
//   setHardwareScalingLevel / freezeActiveMeshes / material.freeze /
//   シャドウ無し / ポストプロセス無し / 環境光+1灯のみ / ドローンはthin instances。
// 安全設計: 人体・実在武器は用いず、ターゲットは幾何パネル、ドローンは非人型の機体。

import {
  Color3,
  Color4,
  Engine,
  FreeCamera,
  HemisphericLight,
  Matrix,
  MeshBuilder,
  Ray,
  Scene,
  StandardMaterial,
  Vector3,
  Viewport,
  type Mesh,
} from "@babylonjs/core";
import { useEffect, useRef, useState } from "react";
import type { ContentItem, LockOnPhaseResult } from "@/game/types";
import {
  computeDronePosition,
  type DronePosition2D,
} from "@/game/phase3d/droneAI";
import {
  interpolateRailPosition,
  type RailWaypoint,
} from "@/game/phase3d/railPath";
import {
  createInitialAimLockState,
  updateAimLockState,
  type AimLockState,
} from "@/game/phase3d/aimLockOn";
import type { DroneSpec } from "@/game/types";
import HUD from "@/game/phase3d/HUD";
import { ensurePerfTier } from "@/game/phase3d/perfBenchmark";
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

// パネルは固定プール(最大選択肢数)を使い回し、setEnabled/位置更新のみ行う
// (メッシュ数を一定に保ち freezeActiveMeshes と両立させる)。
const MAX_PANELS = 4;
const PANEL_Z = 6;
const PANEL_Y = 1.5;
const PANEL_SPREAD = 2.4;

// 妨害ドローン(等速→加速→ジグザグを1体ずつ)。視覚的妨害のみで照準精度には影響しない。
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
const DRONE_LANES = [3.2, 1.2, -1.4]; // 各ドローンの基準高さ。
const DRONE_X_START = -7;
const DRONE_X_RANGE = 14; // この範囲でxをループさせる。
const DRONE_Z = 3.5;

const PHASE_TIME_MS = 60_000;
const HUD_THROTTLE_MS = 66;
// パネルラベルのDOM更新も低スペック端末のGC/再描画負荷を避けるため同間隔でスロットルする。
const LABELS_THROTTLE_MS = HUD_THROTTLE_MS;
// 30fps固定描画。GPU描画(scene.render)のみをこの間隔に間引く(更新ロジックは毎フレーム)。
const RENDER_INTERVAL_MS = 1000 / 30; // ≒33.3ms

interface PanelLabel {
  key: string;
  text: string;
  x: number;
  y: number;
  visible: boolean;
  aiming: boolean;
}

export default function LockOnScene({ questions, onComplete }: LockOnSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Babylonループから参照する不変ハンドル(effect再実行を避けるためref化)。
  const questionsRef = useRef(questions);
  const onCompleteRef = useRef(onComplete);
  questionsRef.current = questions;
  onCompleteRef.current = onComplete;

  const [hud, setHud] = useState({
    remainingAttempts: questions.length,
    timeRemainingMs: PHASE_TIME_MS,
    combo: 0,
  });
  const [labels, setLabels] = useState<PanelLabel[]>([]);
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
      new Vector3(RAIL_WAYPOINTS[0].x, RAIL_WAYPOINTS[0].y, RAIL_WAYPOINTS[0].z),
      scene,
    );
    camera.setTarget(new Vector3(0, PANEL_Y, PANEL_Z));
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

    // ロックオン対象パネル(幾何パネル)。プールを作り使い回す。
    const panelMeshes: Mesh[] = [];
    const panelMats: StandardMaterial[] = [];
    const PANEL_BASE = new Color3(0.18, 0.28, 0.42);
    const PANEL_AIM = new Color3(0.1, 0.7, 0.85);
    for (let i = 0; i < MAX_PANELS; i++) {
      const panel = MeshBuilder.CreatePlane(
        `panel-${i}`,
        { width: 1.6, height: 1.1 },
        scene,
      );
      const mat = new StandardMaterial(`panelMat-${i}`, scene);
      mat.diffuseColor = PANEL_BASE.clone();
      mat.specularColor = new Color3(0, 0, 0);
      mat.backFaceCulling = false;
      panel.material = mat;
      panel.metadata = { isPanel: true, choiceId: null as string | null };
      panelMeshes.push(panel);
      panelMats.push(mat);
    }

    // 妨害ドローン: 単一プレーンのthin instancesで3体を描画する。
    const droneBase = MeshBuilder.CreatePlane(
      "droneBase",
      { size: 0.7 },
      scene,
    );
    const droneMat = new StandardMaterial("droneMat", scene);
    droneMat.diffuseColor = new Color3(0.9, 0.35, 0.2);
    droneMat.emissiveColor = new Color3(0.5, 0.15, 0.05);
    droneMat.specularColor = new Color3(0, 0, 0);
    droneMat.backFaceCulling = false;
    droneMat.freeze();
    droneBase.material = droneMat;
    const droneMatrices = new Float32Array(DRONE_SPECS.length * 16);
    // 初期化(原点)後にバッファ確保。
    for (let i = 0; i < DRONE_SPECS.length; i++) {
      Matrix.Identity().copyToArray(droneMatrices, i * 16);
    }
    droneBase.thinInstanceSetBuffer("matrix", droneMatrices, 16);

    engine.setHardwareScalingLevel(hardwareScalingLevel);

    // 静的シーン構築が完了したのでアクティブメッシュを凍結する。
    scene.freezeActiveMeshes();

    // ---- ミッション進行状態(ループ内で更新するref) ----
    const results: LockOnPhaseResult[] = [];
    let questionIndex = 0;
    let aimState: AimLockState = createInitialAimLockState();
    let questionStartMs = performance.now();
    const phaseStartMs = performance.now();
    let combo = 0;
    let finished = false;
    let lastHudPush = 0;
    let lastLabelsPush = 0;
    let lastRenderMs = 0; // 30fps固定描画: 前回 scene.render() 実行時刻。

    const forwardRay = new Ray(Vector3.Zero(), Vector3.Zero(), 100);

    // 現在の問題のパネルを配置する。
    function layoutQuestion(index: number) {
      const item = qs[index];
      const n = Math.min(item.choices.length, MAX_PANELS);
      const startX = -((n - 1) / 2) * PANEL_SPREAD;
      for (let i = 0; i < MAX_PANELS; i++) {
        const panel = panelMeshes[i];
        if (i < n) {
          const choice = item.choices[i];
          panel.position.set(startX + i * PANEL_SPREAD, PANEL_Y, PANEL_Z);
          panel.setEnabled(true);
          (panel.metadata as { choiceId: string | null }).choiceId = choice.id;
        } else {
          panel.setEnabled(false);
          (panel.metadata as { choiceId: string | null }).choiceId = null;
        }
        panelMats[i].diffuseColor.copyFrom(PANEL_BASE);
      }
      questionStartMs = performance.now();
      aimState = createInitialAimLockState();
    }

    layoutQuestion(0);

    // billboard(Y軸まわりでカメラを向く)行列を作りthin instanceへ書き込む。
    // spawnDelayMs経過前のドローンはスケール0の行列にし、非表示相当にする
    // (thin instancesはenable/disableを持たないため。座標に依存しないため
    // 将来カメラ可動域やミニマップ描画範囲が広がっても再出現しない)。
    const DRONE_HIDDEN_MATRIX = Matrix.Scaling(0, 0, 0);

    function updateDrones(elapsed: number) {
      const cam = camera.position;
      for (let i = 0; i < DRONE_SPECS.length; i++) {
        const dp: DronePosition2D = computeDronePosition(DRONE_SPECS[i], elapsed);
        if (!dp.visible) {
          DRONE_HIDDEN_MATRIX.copyToArray(droneMatrices, i * 16);
          continue;
        }
        const wx =
          DRONE_X_START + (((dp.x % DRONE_X_RANGE) + DRONE_X_RANGE) % DRONE_X_RANGE);
        const wy = DRONE_LANES[i] + dp.y;
        const wz = DRONE_Z;
        const yaw = Math.atan2(cam.x - wx, cam.z - wz);
        const m = Matrix.RotationY(yaw).multiply(
          Matrix.Translation(wx, wy, wz),
        );
        m.copyToArray(droneMatrices, i * 16);
      }
      droneBase.thinInstanceBufferUpdated("matrix");
    }

    // カメラ前方のパネルを判定する。
    function pickAimedPanel(): { meshName: string; choiceId: string } | null {
      const dir = camera.getForwardRay().direction;
      forwardRay.origin.copyFrom(camera.position);
      forwardRay.direction.copyFrom(dir);
      const pick = scene.pickWithRay(
        forwardRay,
        (m) => !!(m.metadata && (m.metadata as { isPanel?: boolean }).isPanel && m.isEnabled()),
      );
      if (pick?.hit && pick.pickedMesh) {
        const cid = (pick.pickedMesh.metadata as { choiceId: string | null })
          .choiceId;
        if (cid) return { meshName: pick.pickedMesh.name, choiceId: cid };
      }
      return null;
    }

    function recordResult(choiceId: string | null) {
      const item = qs[questionIndex];
      const correct = choiceId === item.correctChoiceId;
      results.push({
        contentItemId: item.id,
        hitChoiceId: choiceId,
        correct,
        timeToLockMs: Math.round(performance.now() - questionStartMs),
        droneHitsTaken: 0,
      });
      combo = correct ? combo + 1 : 0;
      questionIndex += 1;
      if (questionIndex >= qs.length) {
        finished = true;
        // 全パネルを隠す。
        for (const p of panelMeshes) p.setEnabled(false);
        onCompleteRef.current(results);
      } else {
        layoutQuestion(questionIndex);
      }
    }

    // フェーズ制限時間切れ。未回答の残り問題を未命中(不正解)として記録し、一度だけ終了する。
    function finishByTimeout(now: number) {
      if (finished) return;
      for (let i = questionIndex; i < qs.length; i++) {
        results.push({
          contentItemId: qs[i].id,
          hitChoiceId: null,
          correct: false,
          // 現在挑戦中の問題は経過時間、以降は未着手として0。
          timeToLockMs:
            i === questionIndex ? Math.max(0, Math.round(now - questionStartMs)) : 0,
          droneHitsTaken: 0,
        });
      }
      questionIndex = qs.length;
      combo = 0;
      finished = true;
      for (const p of panelMeshes) p.setEnabled(false);
      onCompleteRef.current(results);
    }

    function pushHud(now: number) {
      if (now - lastHudPush < HUD_THROTTLE_MS) return;
      lastHudPush = now;
      const remaining = Math.max(
        0,
        PHASE_TIME_MS - (now - phaseStartMs),
      );
      setHud({
        remainingAttempts: qs.length - questionIndex,
        timeRemainingMs: remaining,
        combo,
      });
    }

    // パネルラベルを画面座標へ射影しDOMオーバーレイへ反映する。
    // 低スペック端末のDOM再描画・GC負荷を避けるためHUDと同間隔でスロットルする。
    function pushLabels(now: number, aimedMeshName: string | null) {
      if (now - lastLabelsPush < LABELS_THROTTLE_MS) return;
      lastLabelsPush = now;
      const item = qs[questionIndex];
      const w = engine.getRenderWidth();
      const h = engine.getRenderHeight();
      const vp = new Viewport(0, 0, w, h);
      const transform = scene.getTransformMatrix();
      const next: PanelLabel[] = [];
      const n = Math.min(item.choices.length, MAX_PANELS);
      for (let i = 0; i < n; i++) {
        const panel = panelMeshes[i];
        const p = Vector3.Project(
          panel.position,
          Matrix.Identity(),
          transform,
          vp,
        );
        // 背面(z>1)は非表示。
        const visible = p.z > 0 && p.z < 1;
        next.push({
          key: `${item.id}-${i}`,
          text: item.choices[i].label,
          // CSS座標へ(getRenderWidthはデバイスピクセル、cssは論理px)。割合で配置。
          x: (p.x / w) * 100,
          y: (p.y / h) * 100,
          visible,
          aiming: panel.name === aimedMeshName,
        });
      }
      setLabels(next);
    }

    // レンダーループのコールバックは毎フレーム(rAF周期)実行し、視点更新・ドローン移動・
    // 照準判定・ロックオン状態更新は毎フレーム行う(入力遅延の最小化)。
    // GPU描画である scene.render() のみを約33.3ms間隔(30Hz)に間引く。
    engine.runRenderLoop(() => {
      const now = performance.now();

      if (!finished) {
        // フェーズ制限時間切れ判定(HUD表示だけでなく実際に終了させる)。
        if (now - phaseStartMs >= PHASE_TIME_MS) {
          finishByTimeout(now);
        } else {
          const elapsed = now - phaseStartMs;

          // レール移動(往復)。カメラ位置のみ更新、回転はプレイヤー操作を維持。
          const cycle = (elapsed % RAIL_LOOP_MS) / RAIL_LOOP_MS;
          const tri = cycle < 0.5 ? cycle * 2 : (1 - cycle) * 2; // 0→1→0
          const railPos = interpolateRailPosition(RAIL_WAYPOINTS, tri);
          camera.position.set(railPos.x, railPos.y, railPos.z);

          updateDrones(elapsed);

          const aimed = pickAimedPanel();
          aimState = updateAimLockState(
            aimState,
            aimed ? aimed.meshName : null,
            now,
          );

          // 照準中パネルをハイライト。
          for (let i = 0; i < MAX_PANELS; i++) {
            const isAimed = aimed && panelMeshes[i].name === aimed.meshName;
            panelMats[i].diffuseColor.copyFrom(
              isAimed ? PANEL_AIM : PANEL_BASE,
            );
          }

          if (aimState.locked && aimed) {
            recordResult(aimed.choiceId);
          }

          pushHud(now);
          if (!finished) pushLabels(now, aimed ? aimed.meshName : null);
        }
      }

      // 30fps固定描画: 前回描画から約33.3ms未満なら scene.render() をスキップする。
      if (now - lastRenderMs >= RENDER_INTERVAL_MS) {
        lastRenderMs = now;
        scene.render();
      }
    });

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
      {/* パネル選択肢ラベル(Vector3.Project追従のDOMオーバーレイ) */}
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
        remainingAttempts={hud.remainingAttempts}
        timeRemainingMs={hud.timeRemainingMs}
        combo={hud.combo}
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

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const qs = questionsRef.current;
    if (qs.length === 0) {
      onCompleteRef.current([]);
      return;
    }

    const engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
    });
    const scene = new Scene(engine);
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

    engine.setHardwareScalingLevel(2);

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
    function updateDrones(elapsed: number) {
      const cam = camera.position;
      for (let i = 0; i < DRONE_SPECS.length; i++) {
        const dp: DronePosition2D = computeDronePosition(DRONE_SPECS[i], elapsed);
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
    function pushLabels(aimedMeshName: string | null) {
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

    engine.runRenderLoop(() => {
      if (!finished) {
        const now = performance.now();
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
        if (!finished) pushLabels(aimed ? aimed.meshName : null);
      }

      scene.render();
    });

    const handleResize = () => engine.resize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      scene.dispose();
      engine.dispose();
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
    </div>
  );
}

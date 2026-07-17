// client/src/game/phase3d/LockOnScene.tsx
//
// [担当: task_3d_core] ③ロックオンフェーズ(3Dレール視点)のエントリーポイント。
// Babylon.js の Engine/Scene 起動を含む最小骨格を用意してある
// (依存パッケージ @babylonjs/core は package.json に追加済み。
//  node_modules が無い場合は先に `pnpm install` すること)。
// 低スペック端末向けの最適化方針は docs/game-spec.md「想定デバイスと性能方針」を
// 必ず参照し、本ファイルまたは分離したsetup関数側で適用すること
// (freezeActiveMeshes, material.freeze, setHardwareScalingLevel, リアルタイム
// シャドウ禁止、ポストプロセス不使用 等)。
// 実装ガイドは実装計画JSONの task_3d_core.instructions を参照。
// 現時点ではEngine/Scene起動のみ(照準・ドローン・HUD・作戦カード結果への統合は未実装)。

import {
  ArcRotateCamera,
  Engine,
  HemisphericLight,
  Scene,
  Vector3,
} from "@babylonjs/core";
import { useEffect, useRef } from "react";
import type { ContentItem, LockOnPhaseResult } from "@/game/types";

export interface LockOnSceneProps {
  questions: ContentItem[];
  onComplete: (results: LockOnPhaseResult[]) => void;
}

export default function LockOnScene(_props: LockOnSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
    });
    const scene = new Scene(engine);

    // TODO(task_3d_core): レール移動カメラに置き換える。自由移動は不採用、
    // ウェイポイント間のレール移動+視点操作のみ自由(railPath.ts参照)。
    const camera = new ArcRotateCamera(
      "camera",
      Math.PI / 2,
      Math.PI / 2.5,
      10,
      Vector3.Zero(),
      scene,
    );
    camera.attachControl(canvas, true);

    new HemisphericLight("light", new Vector3(0, 1, 0), scene);

    // TODO(task_3d_core): docs/game-spec.mdの性能方針を適用する
    // (総ポリゴン5万以下、ドローコール30以下、テクスチャ512px以下1-2枚、
    //  scene.freezeActiveMeshes()、マテリアルのfreeze() 等)。
    engine.setHardwareScalingLevel(1.5);

    engine.runRenderLoop(() => {
      scene.render();
    });

    const handleResize = () => engine.resize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      scene.dispose();
      engine.dispose();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}

// client/src/game/phase3d/droneAI.ts
//
// [担当: task_3d_core] 妨害ドローンの3段階移動(等速→加速→ジグザグ)。
// docs/game-spec.md「PUBGモバイルからの技能転移要素」のエイム要素に対応する。
// Babylon型に依存しない純粋関数として実装し、テストしやすくすること
// (実際の描画への反映はLockOnScene.tsx側でthin instances等を使って行う)。
// 実装ガイドは実装計画JSONの task_3d_core.instructions を参照。
// 現時点ではスタブ。

import type { DroneMovementPattern, DroneSpec } from "@/game/types";

export interface DronePosition2D {
  x: number;
  y: number;
}

/** TODO(task_3d_core): 経過時間(ms)からドローンの位置を計算する。 */
export function computeDronePosition(
  _spec: DroneSpec,
  _elapsedMs: number,
): DronePosition2D {
  return { x: 0, y: 0 };
}

/** TODO(task_3d_core): パターンごとの速度係数を返す(等速=1固定、加速=時間で増加、ジグザグ=周期変動)。 */
export function getSpeedMultiplier(
  _pattern: DroneMovementPattern,
  _elapsedMs: number,
): number {
  return 1;
}

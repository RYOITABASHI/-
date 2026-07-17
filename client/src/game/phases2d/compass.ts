// client/src/game/phases2d/compass.ts
//
// [担当: task_2d_phases] 索敵フェーズ: 方位計算・ステレオ音提示のヘルパー。
// 実装ガイドは実装計画JSONの task_2d_phases.instructions を参照。
// 現時点ではスタブ。

import { COMPASS_DIRECTIONS, type CompassDirection } from "@/game/types";

/** TODO(task_2d_phases): 角度(0-360、北=0、時計回り)を8方位に変換する。 */
export function angleToCompassDirection(_angleDeg: number): CompassDirection {
  return COMPASS_DIRECTIONS[0];
}

/** TODO(task_2d_phases): 方位からステレオパン値(-1=左 〜 1=右)を算出する。 */
export function compassDirectionToStereoPan(_direction: CompassDirection): number {
  return 0;
}

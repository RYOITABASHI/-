// client/src/game/phase3d/railPath.ts
//
// [担当: task_3d_core] レール移動(自由移動は不採用。ウェイポイント間のレール移動+
// 視点操作のみ自由)のための経路補間ヘルパー。
// Babylon型に依存しない純粋関数として実装し、テストしやすくすること。
// 実装ガイドは実装計画JSONの task_3d_core.instructions を参照。
// 現時点ではスタブ。

export interface RailWaypoint {
  x: number;
  y: number;
  z: number;
}

/** TODO(task_3d_core): 経過率t(0-1)からウェイポイント列上の位置を線形補間する。 */
export function interpolateRailPosition(
  _waypoints: RailWaypoint[],
  _t: number,
): RailWaypoint {
  return { x: 0, y: 0, z: 0 };
}

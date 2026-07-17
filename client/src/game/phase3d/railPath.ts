// client/src/game/phase3d/railPath.ts
//
// [担当: task_3d_core] レール移動(自由移動は不採用。ウェイポイント間のレール移動+
// 視点操作のみ自由)のための経路補間ヘルパー。Babylon型に依存しない純粋関数。

export interface RailWaypoint {
  x: number;
  y: number;
  z: number;
}

function dist(a: RailWaypoint, b: RailWaypoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * ウェイポイント列を順につないだ折れ線経路上を、進行率 t(0-1) で線形補間する。
 * 区間ごとの累積距離で按分するため、長い区間ほどゆっくり通過する等速移動になる。
 */
export function interpolateRailPosition(
  waypoints: RailWaypoint[],
  t: number,
): RailWaypoint {
  if (waypoints.length === 0) return { x: 0, y: 0, z: 0 };
  if (waypoints.length === 1) return { ...waypoints[0] };

  const clamped = Math.min(1, Math.max(0, t));

  // 区間ごとの距離と総距離を求める。
  const segLengths: number[] = [];
  let total = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const len = dist(waypoints[i], waypoints[i + 1]);
    segLengths.push(len);
    total += len;
  }

  // 全区間が長さ0(同一点)の退化ケース。
  if (total === 0) return { ...waypoints[0] };

  const targetDist = clamped * total;
  let acc = 0;
  for (let i = 0; i < segLengths.length; i++) {
    const len = segLengths[i];
    if (len === 0) continue;
    if (acc + len >= targetDist) {
      const localT = (targetDist - acc) / len;
      const a = waypoints[i];
      const b = waypoints[i + 1];
      return {
        x: a.x + (b.x - a.x) * localT,
        y: a.y + (b.y - a.y) * localT,
        z: a.z + (b.z - a.z) * localT,
      };
    }
    acc += len;
  }

  // 浮動小数の誤差で末端に到達した場合。
  return { ...waypoints[waypoints.length - 1] };
}

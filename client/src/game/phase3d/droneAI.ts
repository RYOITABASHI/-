// client/src/game/phase3d/droneAI.ts
//
// [担当: task_3d_core] 妨害ドローンの3段階移動(等速→加速→ジグザグ)。
// docs/game-spec.md「PUBGモバイルからの技能転移要素」のエイム要素に対応する。
// Babylon型に依存しない純粋関数。描画反映はLockOnScene.tsx側でthin instances化する。

import type { DroneMovementPattern, DroneSpec } from "@/game/types";

export interface DronePosition2D {
  /** 進行方向(横方向)の移動量。 */
  x: number;
  /** 経路に対する垂直オフセット(zigzagのサイン波)。 */
  y: number;
}

const ACCEL_MAX_MULTIPLIER = 2.5;
/** 加速がほぼ上限に達するまでの目安時間(ms)。 */
const ACCEL_RAMP_MS = 4000;
/** zigzagのサイン波周期(ms)。 */
const ZIGZAG_PERIOD_MS = 1500;
/** zigzagの垂直方向の振幅。 */
const ZIGZAG_AMPLITUDE = 2;

/**
 * パターンごとの速度係数を返す。
 * - linear: 1 固定
 * - accelerating: 1 から徐々に増加し ACCEL_MAX_MULTIPLIER でクランプ
 * - zigzag: 前進速度自体は 1 固定(横揺れは位置計算側で付与)
 */
export function getSpeedMultiplier(
  pattern: DroneMovementPattern,
  elapsedMs: number,
): number {
  const t = Math.max(0, elapsedMs);
  switch (pattern) {
    case "accelerating": {
      const ramp = 1 + (ACCEL_MAX_MULTIPLIER - 1) * (t / ACCEL_RAMP_MS);
      return Math.min(ACCEL_MAX_MULTIPLIER, ramp);
    }
    case "zigzag":
    case "linear":
    default:
      return 1;
  }
}

/**
 * 経過時間(ms)からドローンの位置を計算する。
 * 前進は x = baseSpeed * multiplier を時間積分した近似(等速/加速で扱いを変える)、
 * zigzag のみ垂直方向 y にサイン波オフセットを加える。
 * spawnDelayMs 経過前は原点に留める。
 */
export function computeDronePosition(
  spec: DroneSpec,
  elapsedMs: number,
): DronePosition2D {
  const active = Math.max(0, elapsedMs - spec.spawnDelayMs);
  if (active <= 0) return { x: 0, y: 0 };

  const seconds = active / 1000;
  let x: number;
  if (spec.pattern === "accelerating") {
    // 係数が線形に増える区間の移動量 = 面積(台形)を積分した近似。
    const mult = getSpeedMultiplier("accelerating", active);
    const avgMult = (1 + mult) / 2;
    x = spec.baseSpeed * seconds * avgMult;
  } else {
    x = spec.baseSpeed * seconds;
  }

  const y =
    spec.pattern === "zigzag"
      ? Math.sin((active / ZIGZAG_PERIOD_MS) * Math.PI * 2) * ZIGZAG_AMPLITUDE
      : 0;

  return { x, y };
}

// client/src/game/phase3d/aimLockOn.ts
//
// [担当: task_3d_core] 照準保持0.3秒でロックオンが成立するトラッキング方式のロジック。
// LOCK_ON_HOLD_MS (types.ts) を必ず参照すること。Babylon型に依存しない純粋な状態機械
// として実装し、テストしやすくすること。
// 実装ガイドは実装計画JSONの task_3d_core.instructions を参照。
// 現時点ではスタブ。

import { LOCK_ON_HOLD_MS } from "@/game/types";

export interface AimLockState {
  targetId: string | null;
  holdStartedAtMs: number | null;
  locked: boolean;
}

export function createInitialAimLockState(): AimLockState {
  return { targetId: null, holdStartedAtMs: null, locked: false };
}

/**
 * TODO(task_3d_core): 毎フレーム呼び出す。現在照準中のターゲットIDと現在時刻(ms)から
 * 次のAimLockStateを計算する。
 * - targetIdがnullまたは前回と異なる場合は保持をリセットする。
 * - holdStartedAtMsからLOCK_ON_HOLD_MS経過したらlocked=trueにする。
 */
export function updateAimLockState(
  _state: AimLockState,
  _currentTargetId: string | null,
  _nowMs: number,
): AimLockState {
  return createInitialAimLockState();
}

// LOCK_ON_HOLD_MS を再エクスポートし、このモジュールだけを見れば必要な定数が揃うようにする。
export { LOCK_ON_HOLD_MS };

// client/src/game/phase3d/aimLockOn.ts
//
// [担当: task_3d_core] 照準保持0.3秒でロックオンが成立するトラッキング方式のロジック。
// LOCK_ON_HOLD_MS (types.ts) を参照。Babylon型に依存しない純粋な状態機械。

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
 * 毎フレーム呼び出す。現在照準中のターゲットID(照準していなければnull)と
 * 現在時刻(ms)から次のAimLockStateを計算する。
 * - currentTargetId が前回と異なる(nullを含む)場合は保持をリセットする。
 * - 同一ターゲットを LOCK_ON_HOLD_MS 継続照準したら locked=true にする。
 */
export function updateAimLockState(
  state: AimLockState,
  currentTargetId: string | null,
  nowMs: number,
): AimLockState {
  // ターゲットが変わった(照準を外した/別対象に移った)場合はリセット。
  if (currentTargetId !== state.targetId) {
    return {
      targetId: currentTargetId,
      holdStartedAtMs: currentTargetId === null ? null : nowMs,
      locked: false,
    };
  }

  // 照準していない状態が継続。
  if (currentTargetId === null) {
    return { targetId: null, holdStartedAtMs: null, locked: false };
  }

  // 同一ターゲットを継続照準中。開始時刻が未設定なら補完する。
  const startedAt = state.holdStartedAtMs ?? nowMs;
  const locked = state.locked || nowMs - startedAt >= LOCK_ON_HOLD_MS;
  return { targetId: currentTargetId, holdStartedAtMs: startedAt, locked };
}

export { LOCK_ON_HOLD_MS };

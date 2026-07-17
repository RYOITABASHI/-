// client/src/game/phases2d/compass.ts
//
// [担当: task_2d_phases] 索敵フェーズ: 方位計算・ステレオ音提示のヘルパー。
// docs/game-spec.md「② 索敵」参照: 正解パネルの方角をステレオ信号音(簡易版)で提示する。

import { COMPASS_DIRECTIONS, type CompassDirection } from "@/game/types";

/** 角度(0-360、北=0、時計回り)を8方位に変換する。45度ごとの8分割、境界は四捨五入。 */
export function angleToCompassDirection(angleDeg: number): CompassDirection {
  const normalized = ((angleDeg % 360) + 360) % 360;
  const index = Math.round(normalized / 45) % COMPASS_DIRECTIONS.length;
  return COMPASS_DIRECTIONS[index];
}

/** 8方位に対応する基準角度(度)。COMPASS_DIRECTIONSの並び順と対応する。 */
const DIRECTION_ANGLE_DEG: Record<CompassDirection, number> = {
  N: 0,
  NE: 45,
  E: 90,
  SE: 135,
  S: 180,
  SW: 225,
  W: 270,
  NW: 315,
};

/**
 * 方位からステレオパン値(-1=左/西 〜 1=右/東)を算出する。
 * 東寄り(E,NE,SE)は正、西寄り(W,NW,SW)は負、N/Sは0に近い値になる
 * (角度のsinを使うため、真東=1、真西=-1、真北・真南=0)。
 */
export function compassDirectionToStereoPan(direction: CompassDirection): number {
  const rad = (DIRECTION_ANGLE_DEG[direction] * Math.PI) / 180;
  return Math.sin(rad);
}

/**
 * 方位音(簡易ビープ)を鳴らす。Web Audio APIのOscillatorNode+StereoPannerNodeを使う。
 * 演出用の簡易実装であり、再生に失敗しても画面を落とさないようtry/catchで握りつぶす。
 */
export function playCompassBeep(direction: CompassDirection): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const panner = ctx.createStereoPanner();

    oscillator.type = "sine";
    oscillator.frequency.value = 660;
    panner.pan.value = compassDirectionToStereoPan(direction);

    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);

    oscillator.connect(gain).connect(panner).connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.3);
    oscillator.onended = () => {
      void ctx.close().catch(() => {});
    };
  } catch {
    // 音声再生失敗は演出上の付加要素にすぎないため、無視して画面を維持する。
  }
}

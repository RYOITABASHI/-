// client/src/game/phase3d/combatAudio.ts
//
// [担当: task_3d_core] 交戦フェーズの効果音(発射/命中/ミス/コンボ節目)を
// Web Audio APIで手続き生成する。外部音声ファイルは使わない。
//
// 設計方針:
//   既存の phases2d/compass.ts の playCompassBeep は「呼び出しごとに新規
//   AudioContext を生成する」既知の非効率パターンがある(短命 contextの
//   生成/破棄コストとリソースリークの懸念)。本モジュールではこれを踏襲せず、
//   単一の AudioContext を遅延初期化して以降のすべての効果音で使い回す。
//   低スペック端末での連射時にも context 生成コストを発生させない。
//
// 再生は演出上の付加要素にすぎないため、生成・再生失敗時は握りつぶして
// 画面(ゲーム進行)を落とさない。

let sharedCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
// ホワイトノイズ用バッファは1度だけ生成して使い回す(発射音/ミス音で共用)。
let noiseBuffer: AudioBuffer | null = null;

/**
 * 共有 AudioContext を遅延初期化して返す。生成不能(WebAudio非対応等)なら null。
 * 併せてマスターゲイン(全体音量の一元調整用)とノイズバッファを用意する。
 */
function getContext(): AudioContext | null {
  try {
    if (sharedCtx) return sharedCtx;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return null;

    const ctx = new AudioCtx();
    const master = ctx.createGain();
    master.gain.value = 0.45; // 子ども向けに音量は控えめに固定する。
    master.connect(ctx.destination);

    // 0.4秒分のホワイトノイズを1度だけ生成しておく(発射/ミスで使い回す)。
    const frameCount = Math.floor(ctx.sampleRate * 0.4);
    const buffer = ctx.createBuffer(1, frameCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    sharedCtx = ctx;
    masterGain = master;
    noiseBuffer = buffer;
    return ctx;
  } catch {
    return null;
  }
}

/**
 * 一部ブラウザでは AudioContext がユーザー操作まで suspended になる。
 * 効果音はいずれも発射(ユーザー操作)起点で鳴らすため、再生前に resume を試みる。
 */
function ensureRunning(ctx: AudioContext): void {
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => {});
  }
}

/** 短いノイズ源を master 経由で鳴らす共通ヘルパー(発射/ミスで利用)。 */
function playNoiseBurst(
  ctx: AudioContext,
  opts: {
    durationSec: number;
    peakGain: number;
    /** ローパスの遮断周波数。低いほどこもった音(ミス)、高いほど鋭い音(発射)。 */
    lowpassHz: number;
  },
): void {
  if (!noiseBuffer || !masterGain) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = opts.lowpassHz;

  const gain = ctx.createGain();
  const t0 = ctx.currentTime;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(opts.peakGain, t0 + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.durationSec);

  src.connect(filter).connect(gain).connect(masterGain);
  src.start(t0);
  src.stop(t0 + opts.durationSec);
}

/** 単一オシレーターを master 経由で鳴らす共通ヘルパー(命中/コンボで利用)。 */
function playTone(
  ctx: AudioContext,
  opts: {
    type: OscillatorType;
    startHz: number;
    endHz?: number;
    durationSec: number;
    peakGain: number;
    delaySec?: number;
  },
): void {
  if (!masterGain) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const t0 = ctx.currentTime + (opts.delaySec ?? 0);

  osc.type = opts.type;
  osc.frequency.setValueAtTime(opts.startHz, t0);
  if (opts.endHz !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(opts.endHz, t0 + opts.durationSec);
  }

  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(opts.peakGain, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.durationSec);

  osc.connect(gain).connect(masterGain);
  osc.start(t0);
  osc.stop(t0 + opts.durationSec + 0.02);
}

/** 発射音: 鋭い短いノイズパルス + 低い打撃感のサイン波。 */
export function playFireSound(): void {
  try {
    const ctx = getContext();
    if (!ctx) return;
    ensureRunning(ctx);
    playNoiseBurst(ctx, { durationSec: 0.09, peakGain: 0.5, lowpassHz: 3200 });
    playTone(ctx, {
      type: "sine",
      startHz: 180,
      endHz: 60,
      durationSec: 0.08,
      peakGain: 0.35,
    });
  } catch {
    // 演出上の付加要素。失敗しても進行を止めない。
  }
}

/** ヒットマーカー音: 命中時の高めの短いビープ。 */
export function playHitSound(): void {
  try {
    const ctx = getContext();
    if (!ctx) return;
    ensureRunning(ctx);
    playTone(ctx, {
      type: "square",
      startHz: 1320,
      durationSec: 0.07,
      peakGain: 0.28,
    });
  } catch {
    // noop
  }
}

/** ミス音: 外れた際の低めの短いクリック/ノイズ。 */
export function playMissSound(): void {
  try {
    const ctx = getContext();
    if (!ctx) return;
    ensureRunning(ctx);
    playNoiseBurst(ctx, { durationSec: 0.05, peakGain: 0.22, lowpassHz: 700 });
  } catch {
    // noop
  }
}

/**
 * コンボ節目(3の倍数など)の強化演出音。上昇する2音で「ランクアップ」感を出す。
 */
export function playComboMilestoneSound(): void {
  try {
    const ctx = getContext();
    if (!ctx) return;
    ensureRunning(ctx);
    playTone(ctx, {
      type: "triangle",
      startHz: 880,
      durationSec: 0.1,
      peakGain: 0.3,
    });
    playTone(ctx, {
      type: "triangle",
      startHz: 1320,
      durationSec: 0.12,
      peakGain: 0.3,
      delaySec: 0.09,
    });
  } catch {
    // noop
  }
}

/**
 * 共有 AudioContext を破棄する(主にテスト用途)。通常はミッションを跨いで
 * 使い回すため呼ぶ必要はない。
 */
export function disposeCombatAudio(): void {
  try {
    void sharedCtx?.close().catch(() => {});
  } catch {
    // noop
  }
  sharedCtx = null;
  masterGain = null;
  noiseBuffer = null;
}

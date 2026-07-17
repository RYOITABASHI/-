// client/src/game/phases2d/dropAmbience.ts
//
// [担当: task_2d_phases] ①降下選択フェーズの効果音(任意演出)。
// docs/game-spec.md「① 降下選択」参照: 輸送機の飛行・パラシュート降下を
// 手続き的な効果音で補強する。
//
// compass.ts の実装は「呼び出しごとに新規AudioContextを生成する」パターンだが、
// 本フェーズでは輸送機の唸り音をループ再生する都合上非効率になるため、
// モジュール内で単一のAudioContextを生成して使い回す方式にする。
// 再生に失敗しても画面を落とさないよう、常にtry/catchで握りつぶす。

let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return null;
    if (!sharedCtx || sharedCtx.state === "closed") {
      sharedCtx = new AudioCtx();
    }
    if (sharedCtx.state === "suspended") {
      // ユーザー操作(降下先クリック等)のタイミングで呼ばれれば解除される。
      // 自動再生ポリシーでブロックされても無視して継続する。
      void sharedCtx.resume().catch(() => {});
    }
    return sharedCtx;
  } catch {
    return null;
  }
}

export interface AmbienceHandle {
  stop: () => void;
}

const NOOP_HANDLE: AmbienceHandle = { stop: () => {} };

/**
 * 輸送機の低い唸り音をループ再生する。
 * 呼び出し側はunmount時に返り値のstop()を必ず呼ぶこと。
 */
export function startTransportDrone(): AmbienceHandle {
  const ctx = getAudioContext();
  if (!ctx) return NOOP_HANDLE;

  try {
    const oscA = ctx.createOscillator();
    const oscB = ctx.createOscillator();
    const gain = ctx.createGain();

    oscA.type = "sawtooth";
    oscA.frequency.value = 68;
    oscB.type = "sawtooth";
    oscB.frequency.value = 72; // わずかにデチューンし、エンジンのうなり(ビート)を作る

    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.03, ctx.currentTime + 1.5);

    oscA.connect(gain);
    oscB.connect(gain);
    gain.connect(ctx.destination);

    oscA.start();
    oscB.start();

    let stopped = false;
    return {
      stop: () => {
        if (stopped) return;
        stopped = true;
        try {
          const now = ctx.currentTime;
          gain.gain.cancelScheduledValues(now);
          gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
          oscA.stop(now + 0.35);
          oscB.stop(now + 0.35);
        } catch {
          // 停止処理の失敗は無視する(既に停止済み等)。
        }
      },
    };
  } catch {
    return NOOP_HANDLE;
  }
}

/** パラシュート降下時の風切り音を1回再生する。 */
export function playParachuteWindSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const durationSec = 1.1;
    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(500, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(1500, ctx.currentTime + durationSec);
    filter.Q.value = 0.6;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationSec);

    noise.connect(filter).connect(gain).connect(ctx.destination);
    noise.start();
    noise.stop(ctx.currentTime + durationSec);
  } catch {
    // 効果音再生の失敗は演出上の付加要素にすぎないため無視する。
  }
}

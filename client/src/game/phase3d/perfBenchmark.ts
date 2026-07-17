// client/src/game/phase3d/perfBenchmark.ts
//
// [担当: task_3d_core] 初回起動時の簡易ベンチマークと描画品質(hardwareScalingLevel)
// の自動段階切替。docs/game-spec.md「想定デバイスと性能方針」:
//   「初回起動時に3秒程度の簡易ベンチマークを行い、Chromebook/AndroidのANGLE実装差を
//     吸収する形で描画品質を自動段階切替する」
//
// 単なる requestAnimationFrame の間隔測定ではなく、実際に Babylon Engine で軽量な
// テストシーン(複数のPlaneメッシュ + フィルレート負荷)を描画し、readPixels で
// GPU パイプラインを毎フレーム同期させて「実描画コスト(ms)」をサンプリングする。
// これにより vsync(rAF)キャップに埋もれない、ANGLE実装差を拾える計測を行う。
//
// 計測結果は localStorage にキャッシュし、2回目以降のミッションでは再計測しない。

import {
  Color3,
  Color4,
  Engine,
  FreeCamera,
  HemisphericLight,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
  type Mesh,
} from "@babylonjs/core";
import { STORAGE_PREFIX } from "@/game/profile/storage";

/** 描画品質ティア。high=軽い, mid=標準, low=最小。 */
export type PerfTier = "high" | "mid" | "low";

export interface PerfResult {
  tier: PerfTier;
  /** 実描画コストの平均(ms)。 */
  avgFrameMs: number;
  /** 実描画コストの中央値(ms)。 */
  medianFrameMs: number;
  /** engine.setHardwareScalingLevel に渡す値。 */
  hardwareScalingLevel: number;
  /** 計測時刻(ISO8601)。 */
  measuredAt: string;
  /** キャッシュ互換性判定用スキーマバージョン。 */
  version: number;
}

// localStorage キャッシュ。version が一致しない場合は無効化して再計測する。
const CACHE_KEY = `${STORAGE_PREFIX}:perf-tier`;
const CACHE_VERSION = 1;

// ベンチマーク設定(3秒程度を目安に、初回のみ実行)。
const BENCH_TOTAL_MS = 2500; // 実測の総時間。
const BENCH_WARMUP_MS = 400; // 初期化直後の不安定フレームは集計から除外する。
const BENCH_CANVAS_W = 640;
const BENCH_CANVAS_H = 360;
// フィルレート(overdraw)で弱いGPU/ソフトウェアANGLEを炙り出すため、
// 画面を覆う半透明の大きなPlaneを重ね描きする(テクスチャ・シャドウ無しの軽量構成)。
const BENCH_PLANE_COUNT = 40;

/**
 * ティア → hardwareScalingLevel(内部解像度の倍率。大きいほど低解像度=軽い)。
 * docs/game-spec.md「想定デバイスと性能方針」の目安値 1.5〜2 の範囲に収める。
 */
export function tierToHardwareScalingLevel(tier: PerfTier): number {
  switch (tier) {
    case "high":
      return 1.5;
    case "mid":
      return 2;
    case "low":
      return 2;
  }
}

/**
 * 平均実描画コスト(ms)からティアを判定する。
 * 目安: 16ms未満(60fps相当)=high / 16〜33ms(30fps程度)=mid / 33ms超=low。
 */
export function classifyTier(avgFrameMs: number): PerfTier {
  if (avgFrameMs < 16) return "high";
  if (avgFrameMs <= 33) return "mid";
  return "low";
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function makeResult(
  tier: PerfTier,
  avgFrameMs: number,
  medianFrameMs: number,
): PerfResult {
  return {
    tier,
    avgFrameMs: round2(avgFrameMs),
    medianFrameMs: round2(medianFrameMs),
    hardwareScalingLevel: tierToHardwareScalingLevel(tier),
    measuredAt: new Date().toISOString(),
    version: CACHE_VERSION,
  };
}

/** キャッシュ済みの計測結果を取得する。無ければ(バージョン不一致含む)null。 */
export function loadCachedPerf(): PerfResult | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PerfResult>;
    if (parsed.version !== CACHE_VERSION) return null;
    if (
      (parsed.tier !== "high" &&
        parsed.tier !== "mid" &&
        parsed.tier !== "low") ||
      typeof parsed.hardwareScalingLevel !== "number"
    ) {
      return null;
    }
    return parsed as PerfResult;
  } catch {
    return null;
  }
}

/** 計測結果を localStorage に保存する。書き込み不可でも致命的ではない。 */
export function saveCachedPerf(result: PerfResult): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(result));
  } catch {
    // プライベートブラウズ等で localStorage が使えなくても続行する。
  }
}

/** キャッシュを破棄する(デバッグ/再計測用)。 */
export function clearCachedPerf(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // noop
  }
}

/**
 * 実際に軽量シーンを描画して実描画コストをサンプリングし、ティアを判定する。
 * 本番 Engine を作る前に一度だけ呼ぶ想定(結果はキャッシュされる)。
 *
 * @param shouldAbort 呼び出し元(コンポーネント)がアンマウントされた等で計測を打ち切りたい場合に
 *   true を返すコールバック。低スペック端末で不要なGPU/CPU負荷を継続させないため、
 *   毎フレーム確認しtrueなら即座に切り上げる。結果はnullを返す(キャッシュ保存しないこと)。
 */
export async function runPerfBenchmark(
  shouldAbort: () => boolean = () => false,
): Promise<PerfResult | null> {
  // DOM に追加しないオフスクリーンcanvasで計測する。
  const canvas = document.createElement("canvas");
  canvas.width = BENCH_CANVAS_W;
  canvas.height = BENCH_CANVAS_H;

  let engine: Engine;
  try {
    engine = new Engine(canvas, false, {
      preserveDrawingBuffer: false,
      stencil: false,
      // 計測を軽くするため各種明示 off。
      antialias: false,
      powerPreference: "low-power",
    });
  } catch {
    // WebGL が利用できない場合は最も安全な low にフォールバック。
    return shouldAbort() ? null : makeResult("low", 999, 999);
  }

  // Babylon が生成した WebGL コンテキストを取得(同一 type の getContext は既存を返す)。
  const gl =
    (canvas.getContext("webgl2") as WebGL2RenderingContext | null) ??
    (canvas.getContext("webgl") as WebGLRenderingContext | null);

  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.02, 0.03, 0.05, 1);
  scene.autoClear = true;

  const camera = new FreeCamera("benchCam", new Vector3(0, 0, -6), scene);
  camera.setTarget(Vector3.Zero());

  const light = new HemisphericLight("benchLight", new Vector3(0, 1, 0), scene);
  light.intensity = 1;

  const meshes: Mesh[] = [];
  for (let i = 0; i < BENCH_PLANE_COUNT; i++) {
    // ビューを覆う大きめのPlaneを僅かにオフセットして重ね、フィルレート負荷を作る。
    const plane = MeshBuilder.CreatePlane(
      `benchPlane-${i}`,
      { size: 5 },
      scene,
    );
    plane.position.set(
      Math.cos(i * 0.7) * 0.4,
      Math.sin(i * 0.7) * 0.3,
      i * 0.02,
    );
    const mat = new StandardMaterial(`benchMat-${i}`, scene);
    mat.diffuseColor = new Color3(0.2 + 0.01 * i, 0.35, 0.55);
    mat.specularColor = new Color3(0, 0, 0);
    mat.alpha = 0.6; // 半透明で overdraw を確実に発生させる。
    mat.backFaceCulling = false;
    plane.material = mat;
    meshes.push(plane);
  }

  const pixel = new Uint8Array(4);

  const cleanup = () => {
    try {
      scene.dispose();
    } catch {
      // noop
    }
    try {
      engine.dispose();
    } catch {
      // noop
    }
    canvas.width = 0;
    canvas.height = 0;
  };

  return await new Promise<PerfResult | null>((resolve) => {
    const frameCosts: number[] = [];
    const startMs = performance.now();
    let rafId = 0;

    const step = () => {
      if (shouldAbort()) {
        cancelAnimationFrame(rafId);
        cleanup();
        resolve(null);
        return;
      }

      const elapsed = performance.now() - startMs;

      // 毎フレーム軽く回してGPU描画を発生させる。
      for (let i = 0; i < meshes.length; i++) {
        meshes[i].rotation.y += 0.03;
      }

      const t0 = performance.now();
      scene.render();
      // readPixels で GPU パイプラインを同期させ、実描画コストを確定させる。
      if (gl) {
        try {
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        } catch {
          // 一部環境で readPixels 不可でも、CPU側の render 時間だけで続行。
        }
      }
      const cost = performance.now() - t0;

      if (elapsed > BENCH_WARMUP_MS) {
        frameCosts.push(cost);
      }

      if (elapsed >= BENCH_TOTAL_MS) {
        cancelAnimationFrame(rafId);
        const avg =
          frameCosts.length > 0
            ? frameCosts.reduce((a, b) => a + b, 0) / frameCosts.length
            : 999;
        const med = median(frameCosts);
        const tier = classifyTier(avg);
        cleanup();
        resolve(makeResult(tier, avg, med));
        return;
      }
      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
  });
}

/**
 * ティアを取得する。キャッシュがあればそれを返し、無ければ実計測して保存する。
 * 本番シーンのマウント時に呼び、返り値の hardwareScalingLevel を Engine に反映する。
 *
 * @param shouldAbort runPerfBenchmark へそのまま渡す中断判定。中断された場合は
 *   不完全な計測値をキャッシュに保存せず、次回呼び出し時に再計測させる。
 */
export async function ensurePerfTier(
  shouldAbort: () => boolean = () => false,
): Promise<PerfResult> {
  const cached = loadCachedPerf();
  if (cached) return cached;
  const result = await runPerfBenchmark(shouldAbort);
  if (result) {
    saveCachedPerf(result);
    return result;
  }
  // 中断時: 呼び出し元は disposed 相当のガードで戻り値を使わない想定だが、
  // Promise を解決させる必要があるため無難な mid 相当を返す(キャッシュはしない)。
  return makeResult("mid", 20, 20);
}

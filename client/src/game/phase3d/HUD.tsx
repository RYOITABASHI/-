// client/src/game/phase3d/HUD.tsx
//
// [担当: task_3d_core] HUDオーバーレイ(照準/残り試行回数/制限時間ゲージ/コンボ)。
// Babylon Canvasの上に絶対配置するDOM要素。パフォーマンス方針によりBabylon GUIは使わない。

export interface HUDProps {
  remainingAttempts: number;
  timeRemainingMs: number;
  combo: number;
}

// 制限時間ゲージの満タン基準(ms)。timeRemainingMs をこの値に対する割合で表示する。
const TIME_GAUGE_FULL_MS = 60_000;

export default function HUD({
  remainingAttempts,
  timeRemainingMs,
  combo,
}: HUDProps) {
  const timePct = Math.min(
    100,
    Math.max(0, (timeRemainingMs / TIME_GAUGE_FULL_MS) * 100),
  );
  const low = timePct <= 25;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none text-white">
      {/* 上部: 制限時間ゲージ */}
      <div className="absolute left-1/2 top-3 w-2/3 max-w-md -translate-x-1/2">
        <div className="mb-1 text-center text-xs font-medium tracking-widest opacity-80">
          残り時間
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-black/40 ring-1 ring-white/20">
          <div
            className={`h-full rounded-full transition-[width] duration-200 ${
              low ? "bg-red-500" : "bg-cyan-400"
            }`}
            style={{ width: `${timePct}%` }}
          />
        </div>
      </div>

      {/* 右上: 残り試行回数 */}
      <div className="absolute right-4 top-3 rounded-md bg-black/40 px-3 py-1.5 text-right ring-1 ring-white/20">
        <div className="text-[10px] tracking-widest opacity-70">残り試行</div>
        <div className="text-lg font-bold leading-tight tabular-nums">
          {remainingAttempts}
        </div>
      </div>

      {/* 左上: コンボ数 */}
      <div className="absolute left-4 top-3 rounded-md bg-black/40 px-3 py-1.5 ring-1 ring-white/20">
        <div className="text-[10px] tracking-widest opacity-70">コンボ</div>
        <div className="text-lg font-bold leading-tight tabular-nums text-amber-300">
          {combo}
        </div>
      </div>

      {/* 中央: 照準マーク */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="relative h-8 w-8">
          <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-300" />
          <span className="absolute left-1/2 top-0 h-2.5 w-0.5 -translate-x-1/2 bg-cyan-300/80" />
          <span className="absolute bottom-0 left-1/2 h-2.5 w-0.5 -translate-x-1/2 bg-cyan-300/80" />
          <span className="absolute left-0 top-1/2 h-0.5 w-2.5 -translate-y-1/2 bg-cyan-300/80" />
          <span className="absolute right-0 top-1/2 h-0.5 w-2.5 -translate-y-1/2 bg-cyan-300/80" />
        </div>
      </div>
    </div>
  );
}

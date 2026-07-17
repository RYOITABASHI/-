// client/src/game/phase3d/HUD.tsx
//
// [担当: task_3d_core] HUDオーバーレイ(クロスヘア/残弾数/制限時間ゲージ/コンボ/
// キルフィード/発射ボタン)。Babylon Canvasの上に絶対配置するDOM要素。
// パフォーマンス方針によりBabylon GUIは使わず軽量なDOMで構成する。
//
// FPS化(明示的発射)に伴う変更点:
//   - 「残り試行」表示を「残弾数(ammoRemaining)」に変更。
//   - クロスヘアを常設し、有効な標的(選択肢の敵)に重なっている間は色を変える。
//   - 命中時に「撃破: 〇〇」のキルフィードを短時間表示して自動フェードする。
//   - タッチ操作用の大きな発射ボタンを右下に常設する(親指で押しやすい位置)。

export interface HUDProps {
  /** 残弾数(旧: 残り試行回数)。0で交戦フェーズは終了する。 */
  ammoRemaining: number;
  timeRemainingMs: number;
  combo: number;
  /** クロスヘアが現在、選択肢の敵に重なっているか(色分けに使う)。 */
  aimingValid: boolean;
  /**
   * キルフィード表示。id は撃破ごとにインクリメントし、同じテキストでも
   * React が要素を作り直してフェードアニメーションを再生できるようにする。
   */
  killFeed: { text: string; id: number } | null;
  /** 発射ボタン押下(タッチ主入力)。 */
  onFire: () => void;
}

// 制限時間ゲージの満タン基準(ms)。timeRemainingMs をこの値に対する割合で表示する。
const TIME_GAUGE_FULL_MS = 60_000;

export default function HUD({
  ammoRemaining,
  timeRemainingMs,
  combo,
  aimingValid,
  killFeed,
  onFire,
}: HUDProps) {
  const timePct = Math.min(
    100,
    Math.max(0, (timeRemainingMs / TIME_GAUGE_FULL_MS) * 100),
  );
  const low = timePct <= 25;
  const ammoLow = ammoRemaining <= 3;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none text-white">
      {/* キルフィード/コンボポップ用のアニメーション定義(自己完結のため<style>で同梱)。 */}
      <style>{`
        @keyframes hud-killfeed {
          0%   { opacity: 0; transform: translate(-50%, 6px) scale(0.9); }
          12%  { opacity: 1; transform: translate(-50%, 0) scale(1); }
          75%  { opacity: 1; transform: translate(-50%, 0) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -6px) scale(1); }
        }
        @keyframes hud-combo-pop {
          0%   { transform: scale(1); }
          40%  { transform: scale(1.4); }
          100% { transform: scale(1); }
        }
      `}</style>

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

      {/* キルフィード(命中時に「撃破: 〇〇」を出して自動フェード)。 */}
      {killFeed ? (
        <div
          key={killFeed.id}
          className="absolute left-1/2 top-16 -translate-x-1/2 whitespace-nowrap rounded-md bg-red-600/90 px-3 py-1.5 text-sm font-bold tracking-wide ring-1 ring-white/30"
          style={{ animation: "hud-killfeed 1s ease-out forwards" }}
        >
          {killFeed.text}
        </div>
      ) : null}

      {/* 右上: 残弾数 */}
      <div className="absolute right-4 top-3 rounded-md bg-black/40 px-3 py-1.5 text-right ring-1 ring-white/20">
        <div className="text-[10px] tracking-widest opacity-70">残弾数</div>
        <div
          className={`text-lg font-bold leading-tight tabular-nums ${
            ammoLow ? "text-red-400" : "text-white"
          }`}
        >
          {ammoRemaining}
        </div>
      </div>

      {/* 左上: コンボ数(数値が変わるたびにポップさせる) */}
      <div className="absolute left-4 top-3 rounded-md bg-black/40 px-3 py-1.5 ring-1 ring-white/20">
        <div className="text-[10px] tracking-widest opacity-70">コンボ</div>
        <div
          key={combo}
          className="text-lg font-bold leading-tight tabular-nums text-amber-300"
          style={
            combo > 0
              ? { animation: "hud-combo-pop 0.3s ease-out" }
              : undefined
          }
        >
          {combo}
        </div>
      </div>

      {/* 中央: クロスヘア(有効標的に重なると色が変わる) */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="relative h-8 w-8">
          {(() => {
            // 通常時は白/グレー、有効標的に重なっている時は明るいシアン。
            const dot = aimingValid ? "bg-cyan-300" : "bg-white/70";
            const line = aimingValid ? "bg-cyan-300" : "bg-white/60";
            return (
              <>
                <span
                  className={`absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${dot}`}
                />
                <span
                  className={`absolute left-1/2 top-0 h-2.5 w-0.5 -translate-x-1/2 ${line}`}
                />
                <span
                  className={`absolute bottom-0 left-1/2 h-2.5 w-0.5 -translate-x-1/2 ${line}`}
                />
                <span
                  className={`absolute left-0 top-1/2 h-0.5 w-2.5 -translate-y-1/2 ${line}`}
                />
                <span
                  className={`absolute right-0 top-1/2 h-0.5 w-2.5 -translate-y-1/2 ${line}`}
                />
              </>
            );
          })()}
        </div>
      </div>

      {/* 右下: 発射ボタン(タッチ主入力。親指で押しやすい大きめのボタン)。 */}
      <button
        type="button"
        // このボタンだけはクリック/タップを受け取れるようにする(親はpointer-events-none)。
        className="pointer-events-auto absolute bottom-8 right-8 flex h-24 w-24 select-none items-center justify-center rounded-full bg-red-600/80 text-sm font-bold tracking-widest text-white ring-4 ring-white/30 active:scale-95 active:bg-red-500"
        // クリックより早いポインタ押下で反応させ、入力遅延を抑える。
        onPointerDown={(e) => {
          e.preventDefault();
          onFire();
        }}
        // 標準のcontextmenu(長押し)を抑止してタッチ連射の妨げを減らす。
        onContextMenu={(e) => e.preventDefault()}
      >
        発射
      </button>
    </div>
  );
}

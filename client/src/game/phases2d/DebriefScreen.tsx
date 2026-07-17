// client/src/game/phases2d/DebriefScreen.tsx
//
// [担当: task_2d_phases] ⑤デブリーフフェーズ(結果表示)。
// docs/game-spec.md「⑤ デブリーフ」参照: 命中率・先制発見率・エリア内滞在率
// などのログを表示する。描画負荷「なし」要件のためCSS/SVGアニメーションのみ。
//
// 2026-07-17改訂: 保護者の判断によりPUBGモバイル相当の表現を許容する方針に転換
// (docs/game-spec.md冒頭の改訂注記を参照)。高成績時にPUBGモバイルの象徴的な
// 勝利演出 "WINNER WINNER CHICKEN DINNER" を表示し、スタッツ表示もPUBGの
// 試合結果画面を意識したダーク基調のカードUIに強化する。3D描画は使わない。

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { RANK_LABEL_JA, type MissionSummary, type RankTier } from "@/game/types";
import { Crosshair, Eye, ShieldCheck, Flame, Lightbulb, Star, type LucideIcon } from "lucide-react";

export interface DebriefScreenProps {
  summary: MissionSummary;
  onFinish: () => void;
}

/**
 * 「WINNER WINNER CHICKEN DINNER」演出を出す命中率のしきい値。
 * MissionController.tsx の簡易ランクアップ判定 (accuracyRate >= 0.8) と揃える。
 */
const WINNER_ACCURACY_THRESHOLD = 0.8;

/** 階級章の星の数。RANK_ORDER (訓練生→…→エース) の並びと対応させた固定値。 */
const RANK_STARS: Record<RankTier, number> = {
  recruit: 1,
  trooper: 2,
  specialist: 3,
  veteran: 4,
  ace: 5,
};

function toPercent(rate: number): number {
  return Math.round(Math.min(1, Math.max(0, rate)) * 100);
}

function StatCard({
  icon: Icon,
  label,
  pct,
  accentText,
  accentBar,
}: {
  icon: LucideIcon;
  label: string;
  pct: number;
  accentText: string;
  accentBar: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-900/80 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-slate-400">
          <Icon className={`h-3.5 w-3.5 ${accentText}`} aria-hidden />
          {label}
        </div>
        <span className={`text-2xl font-black tabular-nums ${accentText}`}>{pct}%</span>
      </div>
      <Progress value={pct} className={`mt-2 h-1.5 bg-white/10 ${accentBar}`} />
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  accentText,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  accentText: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-white/10 bg-slate-900/80 p-3 text-center">
      <Icon className={`h-4 w-4 ${accentText}`} aria-hidden />
      <div className={`text-2xl font-black tabular-nums ${accentText}`}>{value}</div>
      <div className="text-[11px] tracking-wide text-slate-400">{label}</div>
    </div>
  );
}

export default function DebriefScreen({ summary, onFinish }: DebriefScreenProps) {
  const isWinner = summary.accuracyRate >= WINNER_ACCURACY_THRESHOLD;
  const accuracyPct = toPercent(summary.accuracyRate);
  const stars = RANK_STARS[summary.rankAfter];

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6">
      <div className="flex w-full max-w-md flex-col items-center gap-1 text-center">
        {isWinner ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.7, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 16 }}
            className="flex flex-col items-center gap-2"
          >
            <motion.span
              className="text-5xl"
              initial={{ rotate: -8 }}
              animate={{ rotate: [-8, 8, -8] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              aria-hidden
            >
              🐔
            </motion.span>
            <h1
              className="bg-gradient-to-b from-yellow-200 via-amber-400 to-yellow-600 bg-clip-text text-2xl leading-tight font-black tracking-wide text-transparent uppercase drop-shadow-[0_2px_14px_rgba(251,191,36,0.55)] sm:text-3xl"
            >
              Winner Winner
              <br />
              Chicken Dinner
            </h1>
            <p className="text-sm font-semibold text-amber-300">みごとな成績です！作戦、大成功。</p>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="flex flex-col items-center gap-1"
          >
            <h1 className="text-2xl font-bold text-slate-100">ミッション完了</h1>
            <p className="text-sm text-slate-400">
              {accuracyPct >= 50
                ? "もう少しで完全制覇！次こそ勝利を掴もう。"
                : "お疲れさまでした。次のミッションに備えよう。"}
            </p>
          </motion.div>
        )}
      </div>

      <Card className="w-full max-w-md border-white/10 bg-slate-950/70 py-5 text-slate-100 shadow-xl backdrop-blur">
        <CardHeader className="border-b border-white/10 pb-4">
          <CardTitle className="text-base tracking-wide text-slate-200">戦績レポート</CardTitle>
          <p className="text-xs text-slate-400">今回のミッション結果です。</p>
        </CardHeader>
        <CardContent className="space-y-5 pt-5">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <StatCard
              icon={Crosshair}
              label="命中率"
              pct={toPercent(summary.accuracyRate)}
              accentText="text-emerald-400"
              accentBar="[&>div]:bg-emerald-400"
            />
            <StatCard
              icon={Eye}
              label="先制発見率"
              pct={toPercent(summary.firstDiscoveryRate)}
              accentText="text-sky-400"
              accentBar="[&>div]:bg-sky-400"
            />
            <StatCard
              icon={ShieldCheck}
              label="エリア内滞在率"
              pct={toPercent(summary.zoneStayRate)}
              accentText="text-violet-400"
              accentBar="[&>div]:bg-violet-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <StatTile icon={Flame} label="最大コンボ" value={summary.maxCombo} accentText="text-orange-300" />
            <StatTile icon={Lightbulb} label="ヒント使用数" value={summary.hintsUsed} accentText="text-yellow-200" />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-amber-400/30 bg-gradient-to-r from-slate-900 to-slate-900/50 p-3">
            <span className="text-xs font-medium tracking-wide text-slate-400">階級</span>
            <div className="flex items-center gap-2">
              <div className="flex" aria-hidden>
                {Array.from({ length: stars }).map((_, i) => (
                  <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <span className="text-sm font-bold text-amber-300">{RANK_LABEL_JA[summary.rankAfter]}</span>
            </div>
          </div>

          <Button type="button" className="w-full" onClick={onFinish}>
            ミッション終了
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

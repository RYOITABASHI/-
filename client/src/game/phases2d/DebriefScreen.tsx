// client/src/game/phases2d/DebriefScreen.tsx
//
// [担当: task_2d_phases] ⑤デブリーフフェーズ(結果表示)。
// docs/game-spec.md「⑤ デブリーフ」参照: 命中率・先制発見率・エリア内滞在率
// などのログを表示する。描画負荷「なし」要件のため静的なUIのみ。

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { RANK_LABEL_JA, type MissionSummary } from "@/game/types";

export interface DebriefScreenProps {
  summary: MissionSummary;
  onFinish: () => void;
}

function toPercent(rate: number): number {
  return Math.round(Math.min(1, Math.max(0, rate)) * 100);
}

function RateRow({ label, rate }: { label: string; rate: number }) {
  const pct = toPercent(rate);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="font-semibold tabular-nums">{pct}%</span>
      </div>
      <Progress value={pct} />
    </div>
  );
}

export default function DebriefScreen({ summary, onFinish }: DebriefScreenProps) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-4 sm:p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">デブリーフ</CardTitle>
          <p className="text-sm text-muted-foreground">今回のミッション結果です。</p>
        </CardHeader>
        <CardContent className="space-y-5">
          <RateRow label="命中率" rate={summary.accuracyRate} />
          <RateRow label="先制発見率" rate={summary.firstDiscoveryRate} />
          <RateRow label="エリア内滞在率" rate={summary.zoneStayRate} />

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="rounded-md border p-3 text-center">
              <div className="text-2xl font-bold tabular-nums">{summary.maxCombo}</div>
              <div className="text-xs text-muted-foreground">最大コンボ</div>
            </div>
            <div className="rounded-md border p-3 text-center">
              <div className="text-2xl font-bold tabular-nums">{summary.hintsUsed}</div>
              <div className="text-xs text-muted-foreground">ヒント使用数</div>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <span className="text-sm">階級</span>
            <Badge variant="default" className="text-sm">
              {RANK_LABEL_JA[summary.rankAfter]}
            </Badge>
          </div>

          <Button type="button" className="w-full" onClick={onFinish}>
            ミッション終了
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

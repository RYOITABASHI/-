// client/src/game/phase3d/LoadoutSelectScreen.tsx
//
// [担当: task_3d_core] 作戦カード(ロードアウト)選択画面。
// MVPはDOM/2D UIで実装(phases.ts の renderMode は目安)。

import { SUBJECT_LABEL_JA, type LoadoutCard } from "@/game/types";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface LoadoutSelectScreenProps {
  cards: LoadoutCard[];
  onSelect: (loadoutCardId: string) => void;
}

export default function LoadoutSelectScreen({
  cards,
  onSelect,
}: LoadoutSelectScreenProps) {
  return (
    <div className="flex min-h-full w-full flex-col items-center justify-center gap-6 bg-slate-950 p-6 text-white">
      <div className="text-center">
        <h1 className="text-2xl font-bold">作戦カードを選択</h1>
        <p className="mt-1 text-sm text-slate-400">
          科目別クラスを選んでミッションを開始します。
        </p>
      </div>

      <div className="grid w-full max-w-3xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => onSelect(card.id)}
            className="text-left transition-transform hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <Card className="h-full border-slate-700 bg-slate-900 text-white hover:border-cyan-400">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{card.name}</CardTitle>
                  <Badge variant="secondary">
                    {SUBJECT_LABEL_JA[card.subject]}
                  </Badge>
                </div>
                <CardDescription className="text-slate-400">
                  {card.description}
                </CardDescription>
                <div className="mt-2 flex gap-3 text-xs text-slate-300">
                  <span>ヒント +{card.perk.extraHint}</span>
                  <span>ロック猶予 {card.perk.lockOnGraceMs}ms</span>
                </div>
              </CardHeader>
            </Card>
          </button>
        ))}
      </div>

      {cards.length === 0 && (
        <p className="text-sm text-slate-400">利用可能な作戦カードがありません。</p>
      )}
    </div>
  );
}

// client/src/game/phases2d/ReconScreen.tsx
//
// [担当: task_2d_phases] ②索敵フェーズ(2D俯瞰+方位音)。
// docs/game-spec.md「② 索敵」参照: 課題文を読み要点を拾い、正解パネルの方角を
// 方位音(簡易版)で把握して選択する。描画負荷「極小」要件のため軽量なUIのみ。

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { playCompassBeep } from "@/game/phases2d/compass";
import {
  COMPASS_DIRECTIONS,
  type CompassDirection,
  type ContentItem,
  type ReconPhaseResult,
} from "@/game/types";

export interface ReconScreenProps {
  questions: ContentItem[];
  onComplete: (results: ReconPhaseResult[]) => void;
}

/** compass rose上の配置(3x3グリッド、1始まり)。 */
const GRID_POSITION: Record<CompassDirection, { row: number; col: number }> = {
  N: { row: 1, col: 2 },
  NE: { row: 1, col: 3 },
  E: { row: 2, col: 3 },
  SE: { row: 3, col: 3 },
  S: { row: 3, col: 2 },
  SW: { row: 3, col: 1 },
  W: { row: 2, col: 1 },
  NW: { row: 1, col: 1 },
};

/** 選択肢それぞれに、重複しない方位をランダムに割り当てる(Fisher-Yates)。 */
function assignDirectionsToChoices(
  choiceIds: string[],
): Record<string, CompassDirection> {
  const shuffled = [...COMPASS_DIRECTIONS];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const picked = shuffled.slice(0, choiceIds.length);
  const map: Record<string, CompassDirection> = {};
  choiceIds.forEach((id, i) => {
    map[id] = picked[i];
  });
  return map;
}

export default function ReconScreen({ questions, onComplete }: ReconScreenProps) {
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<ReconPhaseResult[]>([]);
  // 選択肢id -> 割り当てられた方位。ボタンにはこの方位の位置へ選択肢のテキストを表示する。
  const [choiceDirections, setChoiceDirections] = useState<
    Record<string, CompassDirection>
  >({});
  const [correctDirection, setCorrectDirection] = useState<CompassDirection | null>(
    null,
  );
  const [presentedAt, setPresentedAt] = useState<number>(() => Date.now());
  const [pulseVisible, setPulseVisible] = useState(false);
  const completedRef = useRef(false);

  const current = questions[index];

  useEffect(() => {
    if (questions.length === 0 && !completedRef.current) {
      completedRef.current = true;
      onComplete([]);
    }
  }, [questions.length, onComplete]);

  useEffect(() => {
    if (!current) return;
    const map = assignDirectionsToChoices(current.choices.map((c) => c.id));
    const correctDir = map[current.correctChoiceId] ?? null;
    setChoiceDirections(map);
    setCorrectDirection(correctDir);
    setPresentedAt(Date.now());
    if (correctDir) triggerCue(correctDir);
    // 問題(index)が変わるたびに選択肢と方位を割り当て直し、正解の方向から音を鳴らす。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, current?.id]);

  function triggerCue(direction: CompassDirection) {
    playCompassBeep(direction);
    setPulseVisible(true);
    window.setTimeout(() => setPulseVisible(false), 900);
  }

  function handleReplay() {
    if (!correctDirection) return;
    setPresentedAt(Date.now());
    triggerCue(correctDirection);
  }

  function handleSelect(direction: CompassDirection) {
    if (!current) return;
    const reactionTimeMs = Date.now() - presentedAt;
    const correct = direction === correctDirection;
    const result: ReconPhaseResult = {
      contentItemId: current.id,
      selectedDirection: direction,
      correct,
      reactionTimeMs,
    };
    const nextResults = [...results, result];

    if (index + 1 < questions.length) {
      setResults(nextResults);
      setIndex((i) => i + 1);
    } else if (!completedRef.current) {
      completedRef.current = true;
      onComplete(nextResults);
    }
  }

  if (!current) return null;

  const progressPct = Math.round((index / questions.length) * 100);
  // 方位 -> この方位に割り当てられた選択肢、の逆引き。ボタンには選択肢のテキストを表示する。
  const directionToChoice = new Map<
    CompassDirection,
    { id: string; label: string }
  >();
  for (const choice of current.choices) {
    const dir = choiceDirections[choice.id];
    if (dir) directionToChoice.set(dir, choice);
  }

  return (
    <div className="flex min-h-svh flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">索敵</h1>
        <p className="text-sm text-muted-foreground">
          課題文を読み、正しい答えのパネルを選んでください。方位音は正解の方向のヒントです。
        </p>
        <Progress value={progressPct} className="mt-2" />
        <p className="mt-1 text-xs text-muted-foreground">
          {index + 1} / {questions.length} 問
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{current.unit}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-relaxed sm:text-base">{current.prompt}</p>

          <div className="flex flex-col items-center gap-3">
            <div
              className="relative grid aspect-square w-full max-w-xs grid-cols-3 grid-rows-3 gap-1.5"
              role="group"
              aria-label="選択肢"
            >
              {COMPASS_DIRECTIONS.map((direction) => {
                const pos = GRID_POSITION[direction];
                const choice = directionToChoice.get(direction);
                const isPulsing = pulseVisible && direction === correctDirection;
                return (
                  <div
                    key={direction}
                    style={{ gridRow: pos.row, gridColumn: pos.col }}
                    className="relative flex items-center justify-center"
                  >
                    <AnimatePresence>
                      {isPulsing && (
                        <motion.span
                          initial={{ opacity: 0.6, scale: 0.6 }}
                          animate={{ opacity: 0, scale: 1.6 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.8, ease: "easeOut" }}
                          className="pointer-events-none absolute inset-0 rounded-full bg-sky-400/60"
                        />
                      )}
                    </AnimatePresence>
                    {choice && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleSelect(direction)}
                        className="relative h-16 w-16 flex-col gap-0 whitespace-normal break-words rounded-full p-1 text-[11px] leading-tight"
                      >
                        {choice.label}
                      </Button>
                    )}
                  </div>
                );
              })}
              <div className="pointer-events-none col-start-2 row-start-2 flex items-center justify-center">
                <span className="text-[10px] text-muted-foreground">音源</span>
              </div>
            </div>

            <Button type="button" variant="ghost" size="sm" onClick={handleReplay}>
              もう一度きく
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-1.5">
        {results.map((r, i) => (
          <Badge key={i} variant={r.correct ? "default" : "outline"}>
            問{i + 1}: {r.correct ? "正解" : "不正解"}
          </Badge>
        ))}
      </div>
    </div>
  );
}

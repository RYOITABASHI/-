// client/src/game/boss/BossSequenceGame.tsx
//
// [担当: task_boss] ④再現ボス戦: 手順を正しい順序で入力させるミニゲーム。
// docs/game-spec.md「④ 再現ボス戦」「リコイル制御」参照。
// DOM(2D)実装。ステップをシャッフル表示し、タップした順序が正しい手順順序と
// 一致するかを判定する。誤入力は最大MAX_ATTEMPTS回までリトライ可能とし、
// 上限到達で失敗確定とする。

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type {
  BossPhaseResult,
  BossSequence,
  ProcedureStep,
} from "@/game/types";

export interface BossSequenceGameProps {
  sequence: BossSequence;
  onComplete: (result: BossPhaseResult) => void;
}

/** 誤入力の許容回数。上限に達すると失敗確定でonCompleteする。 */
const MAX_ATTEMPTS = 3;

function shuffleSteps(steps: ProcedureStep[]): ProcedureStep[] {
  const arr = [...steps];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function correctOrderIds(sequence: BossSequence): string[] {
  return [...sequence.steps].sort((a, b) => a.order - b.order).map(s => s.id);
}

/**
 * steps の id が重複していないか、order が 1 から欠番・重複なしの連番になっているかを
 * 検証する。データ不整合があると inputOrder.includes(stepId) 等の判定が壊れ、
 * ユーザーがクリアできなくなる恐れがあるため、事前に検知してフォールバック表示に
 * 切り替えるためのチェック。
 */
function isValidSequence(sequence: BossSequence): boolean {
  const { steps } = sequence;
  if (steps.length === 0) return false;

  const ids = steps.map(s => s.id);
  if (new Set(ids).size !== ids.length) return false;

  const orders = [...steps.map(s => s.order)].sort((a, b) => a - b);
  for (let i = 0; i < orders.length; i++) {
    if (orders[i] !== i + 1) return false;
  }
  return true;
}

export default function BossSequenceGame({
  sequence,
  onComplete,
}: BossSequenceGameProps) {
  const [displaySteps, setDisplaySteps] = useState<ProcedureStep[]>(() =>
    shuffleSteps(sequence.steps)
  );
  const [inputOrder, setInputOrder] = useState<string[]>([]);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lastAttemptWrong, setLastAttemptWrong] = useState(false);
  const startedAtRef = useRef(Date.now());
  const completedRef = useRef(false);

  // sequence.steps の id 重複 / order の欠番・重複を検知する。壊れたデータのまま
  // ゲームを進行させるとタップ済み判定や完了判定が破綻するため、事前にガードする。
  const sequenceValid = useMemo(() => isValidSequence(sequence), [sequence]);

  // 正解順のid配列はタップのたびに再計算する必要がないので、sequence変更時のみ計算する。
  const correctOrder = useMemo(
    () => (sequenceValid ? correctOrderIds(sequence) : []),
    [sequence, sequenceValid]
  );

  useEffect(() => {
    if (!sequenceValid) {
      console.error(
        "BossSequenceGame: sequence.steps に不正なデータがあります(idの重複、またはorderの欠番/重複)。",
        sequence
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sequenceValid, sequence.id]);

  // sequenceが変わったら(通常はミッションフェーズ遷移時)全状態をリセットする。
  useEffect(() => {
    if (!sequenceValid) return;
    setDisplaySteps(shuffleSteps(sequence.steps));
    setInputOrder([]);
    setFailedAttempts(0);
    setLastAttemptWrong(false);
    startedAtRef.current = Date.now();
    completedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sequence.id, sequenceValid]);

  function finish(
    success: boolean,
    finalInputOrder: string[],
    attempts: number
  ) {
    if (completedRef.current) return;
    completedRef.current = true;
    const result: BossPhaseResult = {
      bossSequenceId: sequence.id,
      success,
      attempts,
      inputOrder: finalInputOrder,
      timeTakenMs: Date.now() - startedAtRef.current,
    };
    onComplete(result);
  }

  function handleTap(stepId: string) {
    if (completedRef.current || inputOrder.includes(stepId)) return;

    const nextInput = [...inputOrder, stepId];
    setInputOrder(nextInput);
    setLastAttemptWrong(false);

    if (nextInput.length < sequence.steps.length) return;

    const success = nextInput.every((id, i) => id === correctOrder[i]);
    // attempts = 完了した試行(成功含む)の総数。
    const attemptsSoFar = failedAttempts + 1;

    if (success) {
      finish(true, nextInput, attemptsSoFar);
      return;
    }

    if (attemptsSoFar >= MAX_ATTEMPTS) {
      finish(false, nextInput, attemptsSoFar);
      return;
    }

    // 失敗: リトライさせる。チップはシャッフルし直し、入力をリセットする。
    setFailedAttempts(attemptsSoFar);
    setLastAttemptWrong(true);
    setDisplaySteps(shuffleSteps(sequence.steps));
    setInputOrder([]);
  }

  const inputLabels = inputOrder.map(
    id => sequence.steps.find(s => s.id === id)?.label ?? "?"
  );
  const remainingAttempts = MAX_ATTEMPTS - failedAttempts;

  // データ不整合(id重複 / order欠番・重複)の場合はゲームを進行させず、
  // クラッシュや判定破綻を避けるための安全なフォールバック表示にする。
  if (!sequenceValid) {
    return (
      <div className="flex min-h-svh flex-col gap-4 p-4 sm:p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">再現ボス戦</CardTitle>
            <CardDescription>
              このステップは現在利用できません。しばらくしてから再度お試しください。
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">再現ボス戦</h1>
        <p className="text-sm text-muted-foreground">
          手順を正しい順番でタップして再現してください。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{sequence.title}</CardTitle>
          <CardDescription>{sequence.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* リコイル制御演出の簡易版: 残り試行回数を引き戻すべきゲージとして提示する */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">残り試行</span>
            <div className="flex gap-1">
              {Array.from({ length: MAX_ATTEMPTS }).map((_, i) => (
                <span
                  key={i}
                  className={`h-2 w-6 rounded-full ${
                    i < remainingAttempts ? "bg-primary" : "bg-muted"
                  }`}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs text-muted-foreground">入力順:</p>
            <div className="flex min-h-9 flex-wrap gap-1.5 rounded-md border border-dashed p-2">
              {inputLabels.length === 0 && (
                <span className="text-xs text-muted-foreground">
                  まだ入力なし
                </span>
              )}
              {inputLabels.map((label, i) => (
                <Badge key={i} variant="secondary">
                  {i + 1}. {label}
                </Badge>
              ))}
            </div>
          </div>

          {lastAttemptWrong && (
            <p className="text-sm font-medium text-destructive">
              順番が違います。もう一度挑戦してください。(残り{remainingAttempts}
              回)
            </p>
          )}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {displaySteps.map(step => {
              const tapped = inputOrder.includes(step.id);
              return (
                <Button
                  key={step.id}
                  type="button"
                  variant={tapped ? "outline" : "default"}
                  disabled={tapped}
                  onClick={() => handleTap(step.id)}
                  className="h-auto justify-start whitespace-normal py-2 text-left"
                >
                  {step.label}
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

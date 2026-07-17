// client/src/game/boss/BossSequenceGame.tsx
//
// [担当: task_boss] ④再現ボス戦: 手順を正しい順序で入力させるミニゲーム。
// 3D/2Dどちらでもよい(spec上は切替可)。MVPではDOM/2D実装を推奨(実装コスト最小)。
// 実装ガイドは実装計画JSONの task_boss.instructions を参照。
// 現時点ではスタブ。

import type { BossPhaseResult, BossSequence } from "@/game/types";

export interface BossSequenceGameProps {
  sequence: BossSequence;
  onComplete: (result: BossPhaseResult) => void;
}

export default function BossSequenceGame(_props: BossSequenceGameProps) {
  return null;
}

// client/src/game/phases2d/DebriefScreen.tsx
//
// [担当: task_2d_phases] ⑤デブリーフフェーズ(結果表示)。
// 実装ガイドは実装計画JSONの task_2d_phases.instructions を参照。
// 現時点ではスタブ。

import type { MissionSummary } from "@/game/types";

export interface DebriefScreenProps {
  summary: MissionSummary;
  onFinish: () => void;
}

export default function DebriefScreen(_props: DebriefScreenProps) {
  return null;
}

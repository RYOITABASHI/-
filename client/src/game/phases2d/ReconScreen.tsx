// client/src/game/phases2d/ReconScreen.tsx
//
// [担当: task_2d_phases] ②索敵フェーズ(2D俯瞰+方位音)。
// 実装ガイドは実装計画JSONの task_2d_phases.instructions を参照。
// 現時点ではスタブ。

import type { ContentItem, ReconPhaseResult } from "@/game/types";

export interface ReconScreenProps {
  questions: ContentItem[];
  onComplete: (results: ReconPhaseResult[]) => void;
}

export default function ReconScreen(_props: ReconScreenProps) {
  return null;
}

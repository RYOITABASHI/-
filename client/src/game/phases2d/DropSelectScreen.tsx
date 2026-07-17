// client/src/game/phases2d/DropSelectScreen.tsx
//
// [担当: task_2d_phases] ①降下選択フェーズ(2D俯瞰マップ)。
// 実装ガイドは実装計画JSONの task_2d_phases.instructions を参照。
// 現時点ではスタブ。

import type { DropZone } from "@/game/types";

export interface DropSelectScreenProps {
  dropZones: DropZone[];
  onSelect: (dropZoneId: string) => void;
}

export default function DropSelectScreen(_props: DropSelectScreenProps) {
  return null;
}

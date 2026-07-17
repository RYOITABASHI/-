// client/src/game/phase3d/LoadoutSelectScreen.tsx
//
// [担当: task_3d_core] 作戦カード(ロードアウト)選択画面。
// spec上は3D演出の対象だが、MVPではDOM/2D UIでの実装でも構わない
// (phases.ts の MISSION_PHASE_META.loadout.renderMode は目安であり、
//  実装都合で変える場合はそちらも更新すること)。
// 実装ガイドは実装計画JSONの task_3d_core.instructions を参照。
// 現時点ではスタブ。

import type { LoadoutCard } from "@/game/types";

export interface LoadoutSelectScreenProps {
  cards: LoadoutCard[];
  onSelect: (loadoutCardId: string) => void;
}

export default function LoadoutSelectScreen(_props: LoadoutSelectScreenProps) {
  return null;
}

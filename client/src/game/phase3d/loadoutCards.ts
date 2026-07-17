// client/src/game/phase3d/loadoutCards.ts
//
// [担当: task_3d_core] 作戦カード(ロードアウト)のダミーデータ。
// 実装ガイドは実装計画JSONの task_3d_core.instructions を参照。
// 現時点では空配列のスタブ。

import type { LoadoutCard, Subject } from "@/game/types";

export const DUMMY_LOADOUT_CARDS: LoadoutCard[] = [];

/** TODO(task_3d_core): 科目でカードを絞り込む。 */
export function getLoadoutCardsBySubject(_subject: Subject): LoadoutCard[] {
  return DUMMY_LOADOUT_CARDS;
}

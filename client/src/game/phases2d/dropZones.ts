// client/src/game/phases2d/dropZones.ts
//
// [担当: task_2d_phases] 降下選択フェーズ用のダミー挑戦エリアデータ。
// 実装ガイドは実装計画JSONの task_2d_phases.instructions を参照。
// 現時点では空配列のスタブ。

import type { DropZone, GradeLevel, Subject } from "@/game/types";

export const DUMMY_DROP_ZONES: DropZone[] = [];

/** TODO(task_2d_phases): 科目・学年でエリアを絞り込む。 */
export function getDropZonesBySubjectGrade(
  _subject: Subject,
  _grade: GradeLevel,
): DropZone[] {
  return DUMMY_DROP_ZONES;
}

// client/src/game/content/index.ts
//
// [担当: task_content] コンテンツ取得ヘルパーのバレルエクスポート。
// task_2d_phases(索敵)・task_3d_core(ロックオン)はこのモジュール経由で
// 問題データを取得する想定。
// 実装ガイドは実装計画JSONの task_content.instructions を参照。

import type { ContentItem, GradeLevel, Subject } from "@/game/types";
import { DUMMY_QUESTIONS } from "@/game/content/dummyQuestions";

export { DUMMY_QUESTIONS } from "@/game/content/dummyQuestions";
export * from "@/game/content/schema";

/** TODO(task_content): 科目・学年で問題を絞り込む。 */
export function getQuestionsBySubjectGrade(
  _subject: Subject,
  _grade: GradeLevel,
): ContentItem[] {
  return DUMMY_QUESTIONS;
}

/** TODO(task_content): 指定件数をランダムに抽出する(索敵・ロックオン両フェーズで使用)。 */
export function getRandomQuestions(
  _subject: Subject,
  _grade: GradeLevel,
  _count: number,
): ContentItem[] {
  return DUMMY_QUESTIONS;
}

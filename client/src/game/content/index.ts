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

export function getQuestionsBySubjectGrade(
  subject: Subject,
  grade: GradeLevel,
): ContentItem[] {
  return DUMMY_QUESTIONS.filter(
    (item) => item.subject === subject && item.grade === grade,
  );
}

export function getRandomQuestions(
  subject: Subject,
  grade: GradeLevel,
  count: number,
): ContentItem[] {
  const filtered = getQuestionsBySubjectGrade(subject, grade);
  const actual = Math.min(count, filtered.length);

  const shuffled = [...filtered];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.slice(0, actual);
}

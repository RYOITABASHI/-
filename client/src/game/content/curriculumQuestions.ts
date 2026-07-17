// client/src/game/content/curriculumQuestions.ts
//
// 実カリキュラム準拠コンテンツの集約。学習指導要領に基づく本番問題データ。

import type { ContentItem } from "@/game/types";
import { JAPANESE_QUESTIONS } from "@/game/content/questions/japanese";
import { MATH_QUESTIONS } from "@/game/content/questions/math";
import { ENGLISH_QUESTIONS } from "@/game/content/questions/english";

export const CURRICULUM_QUESTIONS: ContentItem[] = [
  ...JAPANESE_QUESTIONS,
  ...MATH_QUESTIONS,
  ...ENGLISH_QUESTIONS,
];

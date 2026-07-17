// client/src/game/content/schema.ts
//
// [担当: task_content] コンテンツのランタイム検証スキーマ (zod)。
// client/src/game/types.ts の ContentItem 等と形を一致させること。
// 実装ガイドは実装計画JSONの task_content.instructions を参照。
// 現時点では最小限のスタブ。

import { z } from "zod";

export const questionChoiceSchema = z.object({
  id: z.string(),
  label: z.string(),
});

export const subjectSchema = z.enum(["japanese", "math", "english"]);

export const gradeLevelSchema = z.enum(["grade2", "grade5"]);

export const difficultySchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

export const contentItemSchema = z
  .object({
    id: z.string(),
    subject: subjectSchema,
    grade: gradeLevelSchema,
    unit: z.string(),
    prompt: z.string(),
    choices: z.array(questionChoiceSchema).min(2),
    correctChoiceId: z.string(),
    explanation: z.string(),
    hintText: z.string().optional(),
    difficulty: difficultySchema,
    tags: z.array(z.string()).optional(),
  })
  .refine(
    (item) => {
      const choiceIds = new Set(item.choices.map((c) => c.id));
      return choiceIds.size === item.choices.length;
    },
    { message: "choice id must be unique" },
  )
  .refine(
    (item) => item.choices.some((c) => c.id === item.correctChoiceId),
    { message: "correctChoiceId must exist in choices" },
  );

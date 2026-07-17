// client/src/game/phases2d/dropZones.ts
//
// [担当: task_2d_phases] 降下選択フェーズ用のダミー挑戦エリアデータ。
// docs/game-spec.md「① 降下選択」参照: 俯瞰マップから難度/報酬のトレードオフを選ぶ。

import type { DropZone, Difficulty, GradeLevel, Subject } from "@/game/types";

/** difficultyに連動した報酬倍率。 */
function rewardMultiplierForDifficulty(difficulty: Difficulty): number {
  switch (difficulty) {
    case 1:
      return 1.0;
    case 2:
      return 1.25;
    case 3:
      return 1.5;
  }
}

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  1: "初級",
  2: "中級",
  3: "上級",
};

/** 科目ごとの単元名バリエーション(難度1/2/3で1件ずつ)。 */
const UNIT_BY_SUBJECT: Record<Subject, [string, string, string]> = {
  japanese: ["音読の広場", "説明文の要点", "物語の心情読解"],
  math: ["たし算・ひき算の陣地", "図形の見取り地帯", "文章題の作戦区域"],
  english: ["アルファベット砂丘", "単語スキャン地帯", "会話文の索敵エリア"],
};

const SUBJECT_ORDER: readonly Subject[] = ["japanese", "math", "english"];
const GRADE_ORDER: readonly GradeLevel[] = ["grade2", "grade5"];

function buildDropZones(): DropZone[] {
  const zones: DropZone[] = [];
  // 科目x学年x難度の組み合わせごとに、マップ上で重ならないようグリッド状に散らす。
  let cellIndex = 0;
  const totalCells = SUBJECT_ORDER.length * GRADE_ORDER.length * 3;
  const cols = 6;
  const rows = Math.ceil(totalCells / cols);

  for (const subject of SUBJECT_ORDER) {
    for (const grade of GRADE_ORDER) {
      const units = UNIT_BY_SUBJECT[subject];
      for (let difficultyIdx = 0; difficultyIdx < 3; difficultyIdx++) {
        const difficulty = (difficultyIdx + 1) as Difficulty;
        const col = cellIndex % cols;
        const row = Math.floor(cellIndex / cols);
        // 10-90の範囲に収め、セル内でジッター(疑似ランダムだが決定的)をかけて重なりを避ける。
        const jitterX = ((cellIndex * 37) % 11) - 5;
        const jitterY = ((cellIndex * 53) % 11) - 5;
        const x = Math.min(92, Math.max(8, 10 + (col * 80) / Math.max(cols - 1, 1) + jitterX));
        const y = Math.min(92, Math.max(8, 10 + (row * 80) / Math.max(rows - 1, 1) + jitterY));

        zones.push({
          id: `${subject}-${grade}-d${difficulty}`,
          name: `${units[difficultyIdx]}(${DIFFICULTY_LABEL[difficulty]})`,
          subject,
          grade,
          difficulty,
          rewardMultiplier: rewardMultiplierForDifficulty(difficulty),
          description: `${DIFFICULTY_LABEL[difficulty]}相当の挑戦エリア。報酬倍率x${rewardMultiplierForDifficulty(
            difficulty,
          )}。`,
          mapPosition: { x, y },
        });
        cellIndex++;
      }
    }
  }
  return zones;
}

/** 科目x学年ごとに難度1〜3を最低3件ずつ(合計18件)用意したダミーデータ。 */
export const DUMMY_DROP_ZONES: DropZone[] = buildDropZones();

/** 科目・学年でエリアを絞り込む。 */
export function getDropZonesBySubjectGrade(
  subject: Subject,
  grade: GradeLevel,
): DropZone[] {
  return DUMMY_DROP_ZONES.filter(
    (zone) => zone.subject === subject && zone.grade === grade,
  );
}

// client/src/game/boss/bossSequences.ts
//
// [担当: task_boss] 再現ボス戦用のダミー手順データ。
// 国語・算数・英語 × 小2/小5 の全6区分について2件ずつ(合計12件)用意する。
// content team(task_content)のContentItemには依存させず、本ファイル内で
// 完結したダミーデータとして定義する(チーム間の依存を減らすため)。
// docs/game-spec.md「④ 再現ボス戦」参照: 解法・手順を正しい順序で再現する。

import type {
  BossSequence,
  GradeLevel,
  ProcedureStep,
  Subject,
} from "@/game/types";

/** sequenceId内で一意なステップidを組み立てるヘルパー。 */
function steps(sequenceId: string, labels: string[]): ProcedureStep[] {
  return labels.map((label, i) => ({
    id: `${sequenceId}-s${i + 1}`,
    order: i + 1,
    label,
  }));
}

export const DUMMY_BOSS_SEQUENCES: BossSequence[] = [
  // ---------------------------------------------------------------------
  // 国語 (japanese)
  // ---------------------------------------------------------------------
  {
    id: "boss-japanese-grade2-1",
    subject: "japanese",
    grade: "grade2",
    title: "文の要点を見つける",
    description:
      "短い文から「誰が」「どうした」を拾い、ひとことでまとめる手順を再現する。",
    steps: steps("boss-japanese-grade2-1", [
      "誰が、を探す",
      "どうした、を探す",
      "ひとことでまとめる",
    ]),
  },
  {
    id: "boss-japanese-grade2-2",
    subject: "japanese",
    grade: "grade2",
    title: "音読の区切りを見つける",
    description: "文を意味のまとまりで区切って声に出す手順を再現する。",
    steps: steps("boss-japanese-grade2-2", [
      "主語を見つける",
      "述語を見つける",
      "主語と述語の間に区切りを入れる",
      "区切りごとに声に出して読む",
    ]),
  },
  {
    id: "boss-japanese-grade5-1",
    subject: "japanese",
    grade: "grade5",
    title: "説明文の要旨をまとめる",
    description:
      "話題文・具体例・まとめの文をたどって要旨を一文にする手順を再現する。",
    steps: steps("boss-japanese-grade5-1", [
      "話題文をさがす",
      "具体例を見つける",
      "まとめの文をさがす",
      "要旨を一文にする",
    ]),
  },
  {
    id: "boss-japanese-grade5-2",
    subject: "japanese",
    grade: "grade5",
    title: "登場人物の心情を読み取る",
    description:
      "場面・行動描写・心情語を結びつけて心情を読み取る手順を再現する。",
    steps: steps("boss-japanese-grade5-2", [
      "場面を確認する",
      "行動や表情の描写を探す",
      "心情を表す言葉を探す",
      "出来事と心情を結び付ける",
    ]),
  },

  // ---------------------------------------------------------------------
  // 算数 (math)
  // ---------------------------------------------------------------------
  {
    id: "boss-math-grade2-1",
    subject: "math",
    grade: "grade2",
    title: "27+15の筆算",
    description:
      "2桁のたし算の筆算を、位ごとに繰り上がりを処理しながら再現する。",
    steps: steps("boss-math-grade2-1", [
      "1の位(7+5)を計算する",
      "繰り上がりの1を10の位にメモする",
      "10の位(2+1)を計算し繰り上がりを足す",
    ]),
  },
  {
    id: "boss-math-grade2-2",
    subject: "math",
    grade: "grade2",
    title: "42-18の筆算",
    description: "2桁のひき算の筆算を、繰り下がりを処理しながら再現する。",
    steps: steps("boss-math-grade2-2", [
      "1の位(2-8)は引けないので10の位から繰り下げる",
      "1の位(12-8)を計算する",
      "10の位(3-1)を計算する",
    ]),
  },
  {
    id: "boss-math-grade5-1",
    subject: "math",
    grade: "grade5",
    title: "270+150の筆算",
    description:
      "3桁のたし算の筆算を、位ごとに繰り上がりを処理しながら再現する。",
    steps: steps("boss-math-grade5-1", [
      "1の位(0+0)を計算する",
      "10の位(7+5)を計算し繰り上げる",
      "100の位に繰り上がりを足す",
    ]),
  },
  {
    id: "boss-math-grade5-2",
    subject: "math",
    grade: "grade5",
    title: "1/2 + 1/3の計算",
    description: "異分母の分数のたし算を、通分してから計算する手順を再現する。",
    steps: steps("boss-math-grade5-2", [
      "分母の最小公倍数(6)を見つける",
      "それぞれの分数を通分する",
      "分子どうしを足す",
      "約分できるか確認する",
    ]),
  },

  // ---------------------------------------------------------------------
  // 英語 (english)
  // ---------------------------------------------------------------------
  {
    id: "boss-english-grade2-1",
    subject: "english",
    grade: "grade2",
    title: "英文の語順(I am Ken.)",
    description: "自己紹介の英文を正しい語順で再現する。",
    steps: steps("boss-english-grade2-1", ["I", "am", "Ken"]),
  },
  {
    id: "boss-english-grade2-2",
    subject: "english",
    grade: "grade2",
    title: "英文の語順(This is a pen.)",
    description: "ものを紹介する英文を正しい語順で再現する。",
    steps: steps("boss-english-grade2-2", ["This", "is", "a pen"]),
  },
  {
    id: "boss-english-grade5-1",
    subject: "english",
    grade: "grade5",
    title: "英文の語順(I like dogs.)",
    description: "好みを伝える英文を正しい語順で再現する。",
    steps: steps("boss-english-grade5-1", ["I", "like", "dogs"]),
  },
  {
    id: "boss-english-grade5-2",
    subject: "english",
    grade: "grade5",
    title: "英文の語順(Do you like cats?)",
    description: "疑問文を正しい語順で再現する。",
    steps: steps("boss-english-grade5-2", ["Do", "you", "like", "cats"]),
  },
];

/** 科目・学年でボスシーケンスを絞り込む(該当なしの場合は空配列)。 */
export function getBossSequencesBySubjectGrade(
  subject: Subject,
  grade: GradeLevel
): BossSequence[] {
  return DUMMY_BOSS_SEQUENCES.filter(
    s => s.subject === subject && s.grade === grade
  );
}

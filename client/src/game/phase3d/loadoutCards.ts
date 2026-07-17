// client/src/game/phase3d/loadoutCards.ts
//
// [担当: task_3d_core] 作戦カード(ロードアウト)のダミーデータ。
// spec「その他のFPS要素 > 作戦カード」の3クラス(国語偵察/算数工兵/英語通信)。

import type { LoadoutCard, Subject } from "@/game/types";

export const DUMMY_LOADOUT_CARDS: LoadoutCard[] = [
  {
    id: "loadout-japanese-recon",
    subject: "japanese",
    name: "国語偵察",
    description:
      "文章の要点を遠距離から精密射撃するクラス。読解ヒントが多く、じっくり狙える。",
    perk: { extraHint: 2, lockOnGraceMs: 100 },
  },
  {
    id: "loadout-math-engineer",
    subject: "math",
    name: "算数工兵",
    description:
      "解法と手順を組み立てる汎用アサルトクラス。ロックオン猶予は控えめ、公式ヒントに強い。",
    perk: { extraHint: 1, lockOnGraceMs: 50 },
  },
  {
    id: "loadout-english-comms",
    subject: "english",
    name: "英語通信",
    description:
      "単語と音を近~中距離で速射する通信クラス。ロックオン猶予が長く、リズムよく狙える。",
    perk: { extraHint: 1, lockOnGraceMs: 80 },
  },
];

export function getLoadoutCardsBySubject(subject: Subject): LoadoutCard[] {
  return DUMMY_LOADOUT_CARDS.filter((card) => card.subject === subject);
}

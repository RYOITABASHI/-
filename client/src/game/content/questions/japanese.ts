// client/src/game/content/questions/japanese.ts
//
// 国語コンテンツ(小2/小5)。学習指導要領準拠。
// 小2: 説明文の要点/物語文の登場人物の気持ち/主語・述語/指示語(これ・それ・あれ)/
//      簡単な因果関係の読み取り
//      ※本文・選択肢は小学校1・2年生配当漢字の範囲に限定(不安な漢字はひらがな表記)。
// 小5: 説明的文章の要旨・要約/論説文の主張と根拠/物語文の心情変化/
//      資料(図表)を含む複合的読解の初歩/敬語の基礎/慣用句・ことわざ/
//      文の成分(主語・述語・修飾語)/原因と結果を表す接続語
//
// 題材は自然観察・学校生活・友人関係など平和的なものに限定し、暴力的・攻撃的な
// 表現は含めていない。

import type { ContentItem } from "@/game/types";

export const JAPANESE_QUESTIONS: ContentItem[] = [
  // ==================== 国語/小2 ====================

  // --- 説明文の要点 ---
  {
    id: "japanese-grade2-1",
    subject: "japanese",
    grade: "grade2",
    unit: "説明文の要点",
    prompt:
      "たんぽぽの花がさきおわると、わたげになります。わたげは風にのって、とおくまでとんでいきます。",
    choices: [
      { id: "a", label: "たんぽぽは水の中でさく" },
      { id: "b", label: "わたげは風にのってとおくへとぶ" },
      { id: "c", label: "たんぽぽは冬にさく" },
    ],
    correctChoiceId: "b",
    explanation: "文しょうに「風にのって、とおくまでとんでいきます」と書いてあります。",
    difficulty: 1,
  },
  {
    id: "japanese-grade2-2",
    subject: "japanese",
    grade: "grade2",
    unit: "説明文の要点",
    prompt:
      "かたつむりは、雨がふる日によく見つかります。かわいた日には、あまり出てきません。",
    choices: [
      { id: "a", label: "かたつむりは雨の日によく見つかる" },
      { id: "b", label: "かたつむりは晴れた日によく出る" },
      { id: "c", label: "かたつむりは冬しか出ない" },
    ],
    correctChoiceId: "a",
    explanation: "文に「雨がふる日によく見つかります」と書いてあります。",
    difficulty: 1,
  },
  {
    id: "japanese-grade2-3",
    subject: "japanese",
    grade: "grade2",
    unit: "説明文の要点",
    prompt:
      "うさぎの耳は長くて、よくうごきます。耳をつかって、遠くの音を聞くことができます。",
    choices: [
      { id: "a", label: "うさぎは耳で遠くの音を聞く" },
      { id: "b", label: "うさぎの耳はうごかない" },
      { id: "c", label: "うさぎは耳が聞こえない" },
    ],
    correctChoiceId: "a",
    explanation: "文に「耳をつかって、遠くの音を聞くことができます」と書いてあります。",
    difficulty: 2,
  },
  {
    id: "japanese-grade2-4",
    subject: "japanese",
    grade: "grade2",
    unit: "説明文の要点",
    prompt:
      "土の中には、小さな虫がたくさんすんでいます。虫たちは、土の中の古いはっぱを食べて生きています。",
    choices: [
      { id: "a", label: "虫は土の中で、古いはっぱを食べて生きている" },
      { id: "b", label: "虫は空をとんで生きている" },
      { id: "c", label: "虫は水の中だけにすんでいる" },
    ],
    correctChoiceId: "a",
    explanation: "文に「土の中の古いはっぱを食べて生きています」と書いてあります。",
    difficulty: 2,
  },

  // --- 登場人物の気持ち ---
  {
    id: "japanese-grade2-5",
    subject: "japanese",
    grade: "grade2",
    unit: "登場人物の気持ち",
    prompt:
      "あしたは遠足です。ゆうたは前の日からリュックにおやつを入れて、にこにこわらっていました。",
    choices: [
      { id: "a", label: "ゆうたは遠足が楽しみでうれしい" },
      { id: "b", label: "ゆうたは遠足に行きたくない" },
      { id: "c", label: "ゆうたはリュックをわすれた" },
    ],
    correctChoiceId: "a",
    explanation: "にこにこわらっていることから、ゆうたが遠足を楽しみにしていることが分かります。",
    difficulty: 1,
  },
  {
    id: "japanese-grade2-6",
    subject: "japanese",
    grade: "grade2",
    unit: "登場人物の気持ち",
    prompt:
      "花子は大切にしていた花びんを、あやまってわってしまいました。花子は下をむいて、なみだを見せました。",
    choices: [
      { id: "a", label: "花子はかなしい気もちになった" },
      { id: "b", label: "花子はうれしい気もちになった" },
      { id: "c", label: "花子はおこっている" },
    ],
    correctChoiceId: "a",
    explanation: "花びんをわってしまい、下をむいてなみだを見せているので、かなしい気もちだと分かります。",
    difficulty: 2,
  },
  {
    id: "japanese-grade2-7",
    subject: "japanese",
    grade: "grade2",
    unit: "登場人物の気持ち",
    prompt:
      "けんとは自分で作った紙ひこうきを、空高くとばすことができました。けんとは大きな声で「やったあ」とさけびました。",
    choices: [
      { id: "a", label: "けんとは紙ひこうきがうまくとんでうれしい" },
      { id: "b", label: "けんとは紙ひこうきがこわれてかなしい" },
      { id: "c", label: "けんとはとぶのがこわい" },
    ],
    correctChoiceId: "a",
    explanation: "「やったあ」と大きな声でさけんでいるので、けんとがうれしい気もちだと分かります。",
    difficulty: 1,
  },

  // --- 主語・述語 ---
  {
    id: "japanese-grade2-8",
    subject: "japanese",
    grade: "grade2",
    unit: "主語・述語",
    prompt:
      "つぎの文を読みましょう。「小さい犬が、公園を元気に走る。」この文で、「はしる」のはだれですか。",
    choices: [
      { id: "a", label: "犬" },
      { id: "b", label: "公園" },
      { id: "c", label: "元気" },
    ],
    correctChoiceId: "a",
    explanation: "「犬が」「走る」なので、走っているのは犬です。「犬が」ということばが、文の中心になることばです。",
    difficulty: 1,
  },
  {
    id: "japanese-grade2-9",
    subject: "japanese",
    grade: "grade2",
    unit: "主語・述語",
    prompt:
      "つぎの文を読みましょう。「白い花が、にわにさく。」この文で、「なにが」にあたることばはどれですか。",
    choices: [
      { id: "a", label: "白い" },
      { id: "b", label: "花が" },
      { id: "c", label: "さく" },
    ],
    correctChoiceId: "b",
    explanation: "「なにが」にあたることばは「花が」です。これが、文の中心になることばです。",
    difficulty: 2,
  },
  {
    id: "japanese-grade2-10",
    subject: "japanese",
    grade: "grade2",
    unit: "主語・述語",
    prompt:
      "つぎの文を読みましょう。「弟は、朝早く学校へ行く。」この文で、「行く」のはだれですか。",
    choices: [
      { id: "a", label: "弟" },
      { id: "b", label: "朝" },
      { id: "c", label: "学校" },
    ],
    correctChoiceId: "a",
    explanation: "「弟は」「行く」なので、学校へ行くのは弟です。",
    difficulty: 1,
  },

  // --- 指示語(これ・それ・あれ) ---
  {
    id: "japanese-grade2-11",
    subject: "japanese",
    grade: "grade2",
    unit: "指示語",
    prompt:
      "村上さんは新しいボールを買いました。これで、休み時間に友だちとあそびます。「これ」は何のことですか。",
    choices: [
      { id: "a", label: "ボール" },
      { id: "b", label: "休み時間" },
      { id: "c", label: "友だち" },
    ],
    correctChoiceId: "a",
    explanation: "村上さんが買ったのはボールなので、「これ」はボールのことです。",
    difficulty: 2,
  },
  {
    id: "japanese-grade2-12",
    subject: "japanese",
    grade: "grade2",
    unit: "指示語",
    prompt:
      "教室のまどの外に、大きな木があります。それは、百年もまえからそこに立っているそうです。「それ」は何のことですか。",
    choices: [
      { id: "a", label: "教室" },
      { id: "b", label: "大きな木" },
      { id: "c", label: "まど" },
    ],
    correctChoiceId: "b",
    explanation: "「それ」は前の文に出てきた「大きな木」のことです。",
    difficulty: 2,
  },
  {
    id: "japanese-grade2-13",
    subject: "japanese",
    grade: "grade2",
    unit: "指示語",
    prompt:
      "たろうは、赤い自てん車をもっています。あれは、お兄さんからもらった大切なものです。「あれ」は何のことですか。",
    choices: [
      { id: "a", label: "自てん車" },
      { id: "b", label: "お兄さん" },
      { id: "c", label: "お母さん" },
    ],
    correctChoiceId: "a",
    explanation: "「あれ」は前に出てきた「自てん車」のことです。",
    difficulty: 3,
  },

  // --- 簡単な因果関係の読み取り ---
  {
    id: "japanese-grade2-14",
    subject: "japanese",
    grade: "grade2",
    unit: "因果関係の読み取り",
    prompt: "空に黒い雲が広がってきました。だから、犬たちはいそいで犬ごやに入りました。",
    choices: [
      { id: "a", label: "雲が広がったから、犬たちは犬ごやに入った" },
      { id: "b", label: "犬たちは犬ごやがきらいだから入った" },
      { id: "c", label: "天気がよかったから、犬たちは外であそんだ" },
    ],
    correctChoiceId: "a",
    explanation: "「だから」の前に「黒い雲が広がってきた」というわけが書いてあります。",
    difficulty: 2,
  },
  {
    id: "japanese-grade2-15",
    subject: "japanese",
    grade: "grade2",
    unit: "因果関係の読み取り",
    prompt: "雨がたくさんふりました。そのため、川の水がふえて、色が茶色になりました。",
    choices: [
      { id: "a", label: "雨がたくさんふったので、川の水がふえた" },
      { id: "b", label: "川の水がへったので、雨がふった" },
      { id: "c", label: "天気が晴れたので、川の水がへった" },
    ],
    correctChoiceId: "a",
    explanation: "「そのため」の前に書かれている「雨がたくさんふった」ことがわけです。",
    difficulty: 3,
  },
  {
    id: "japanese-grade2-16",
    subject: "japanese",
    grade: "grade2",
    unit: "因果関係の読み取り",
    prompt: "花に水をあげませんでした。すると、花は元気をなくして、しおれてしまいました。",
    choices: [
      { id: "a", label: "水をあげなかったので、花がしおれた" },
      { id: "b", label: "水をたくさんあげたので、花が元気になった" },
      { id: "c", label: "日光が強すぎたので、花がしおれた" },
    ],
    correctChoiceId: "a",
    explanation: "水をあげなかったことがわけで、花がしおれてしまいました。",
    difficulty: 2,
  },

  // ==================== 国語/小5 ====================

  // --- 説明的文章の要旨・要約 ---
  {
    id: "japanese-grade5-1",
    subject: "japanese",
    grade: "grade5",
    unit: "説明的文章の要旨・要約",
    prompt:
      "森林は、大雨がふったときに水をたくわえて、川の水があふれるのをふせぐ働きをしている。また、木の根が土をしっかりと支えるため、山くずれを防ぐ役目も持っている。このように、森林には人々の生活を守る大切な働きがある。",
    choices: [
      { id: "a", label: "森林は水をたくわえたり土をささえたりして、人々の生活を守っている" },
      { id: "b", label: "森林は木を切るためだけに存在する" },
      { id: "c", label: "森林は雨をふらせる働きがある" },
      { id: "d", label: "森林があると山くずれが起きやすくなる" },
    ],
    correctChoiceId: "a",
    explanation:
      "文章全体で、森林が水をたくわえ土をささえて人々を守る働きを説明しています。最後の一文が要旨です。",
    difficulty: 2,
  },
  {
    id: "japanese-grade5-2",
    subject: "japanese",
    grade: "grade5",
    unit: "説明的文章の要旨・要約",
    prompt:
      "ミツバチは花から花へ飛び回り、みつを集めるだけでなく、花粉を運ぶことで植物の実を育てる手助けをしている。もしミツバチがいなくなれば、多くの植物が実をつけられなくなると言われている。",
    choices: [
      { id: "a", label: "ミツバチは花粉を運び、植物が実をつけるのを助けている" },
      { id: "b", label: "ミツバチは植物にとって害になる存在である" },
      { id: "c", label: "ミツバチはみつを集めるだけで、他には何もしない" },
      { id: "d", label: "植物はミツバチがいなくても実をつけられる" },
    ],
    correctChoiceId: "a",
    explanation: "文章は、ミツバチが花粉を運んで植物の実を育てる手助けをしていると説明しています。",
    difficulty: 2,
  },

  // --- 論説文の主張と根拠 ---
  {
    id: "japanese-grade5-3",
    subject: "japanese",
    grade: "grade5",
    unit: "論説文の主張と根拠",
    prompt:
      "わたしたちは、もっと本を読むべきだ。なぜなら、本を読むことで知らない世界を知り、考える力を身につけることができるからだ。実際に、読書量が多い人ほど、文章を書く力が高いという調査結果もある。",
    choices: [
      { id: "a", label: "主張は「本を読むべきだ」で、根拠は「知らない世界を知り、考える力を身につけられるから」" },
      { id: "b", label: "主張は「本は読まなくてよい」である" },
      { id: "c", label: "根拠として、テレビを見るべきだと書かれている" },
      { id: "d", label: "この文章に主張は書かれていない" },
    ],
    correctChoiceId: "a",
    explanation: "「なぜなら」の後に理由(根拠)が書かれ、最初の文が主張です。",
    difficulty: 2,
  },
  {
    id: "japanese-grade5-4",
    subject: "japanese",
    grade: "grade5",
    unit: "論説文の主張と根拠",
    prompt:
      "学校でのあいさつ運動は続けるべきだと考える。理由は二つある。一つは、あいさつをすることで学校のふんいきが明るくなるからだ。もう一つは、あいさつを通して人と人との関わりが生まれるからだ。",
    choices: [
      {
        id: "a",
        label: "主張は「あいさつ運動を続けるべきだ」で、理由は「ふんいきが明るくなる」「人との関わりが生まれる」の二つ",
      },
      { id: "b", label: "主張は「あいさつ運動はやめるべきだ」である" },
      { id: "c", label: "あいさつ運動の理由は書かれていない" },
      { id: "d", label: "あいさつは学校でしてはいけない" },
    ],
    correctChoiceId: "a",
    explanation: "最初の文が主張で、「理由は二つある」のあとに根拠が二つ説明されています。",
    difficulty: 3,
  },

  // --- 物語文の心情変化 ---
  {
    id: "japanese-grade5-5",
    subject: "japanese",
    grade: "grade5",
    unit: "物語文の心情変化",
    prompt:
      "由紀は大会前、毎日練習してもタイムがのびず、走ることがいやになっていた。しかし、応援してくれる仲間の声を聞いたとき、由紀の心に再び「がんばろう」という気持ちがわいてきた。",
    choices: [
      { id: "a", label: "走ることがいやになっていたが、仲間の応援を聞いて前向きな気持ちに変わった" },
      { id: "b", label: "由紀はずっとやる気にあふれていた" },
      { id: "c", label: "由紀は仲間の声を聞いて、もっといやになった" },
      { id: "d", label: "由紀は最初から自信を持っていた" },
    ],
    correctChoiceId: "a",
    explanation: "「走ることがいやになっていた」から「がんばろう」という気持ちへ変化したことが読み取れます。",
    difficulty: 2,
  },
  {
    id: "japanese-grade5-6",
    subject: "japanese",
    grade: "grade5",
    unit: "物語文の心情変化",
    prompt:
      "健一は、転校してきたばかりで、クラスに知り合いが一人もいなかった。休み時間はいつも一人で過ごしていた。ある日、同じ組の大輝が「昼休み、いっしょにサッカーしよう」と声をかけてくれた。健一は思わず笑顔になり、「うん、行く」と答えた。",
    choices: [
      { id: "a", label: "健一は最初さびしい気持ちだったが、大輝に声をかけられてうれしい気持ちに変わった" },
      { id: "b", label: "健一は転校してきてすぐに友達がたくさんできた" },
      { id: "c", label: "健一は大輝に声をかけられて、いやな気持ちになった" },
      { id: "d", label: "健一はサッカーが嫌いだ" },
    ],
    correctChoiceId: "a",
    explanation: "一人で過ごしていた健一が、大輝の声かけで笑顔になったことから、気持ちの変化が読み取れます。",
    difficulty: 1,
  },

  // --- 資料(図表)を含む複合的読解の初歩 ---
  {
    id: "japanese-grade5-7",
    subject: "japanese",
    grade: "grade5",
    unit: "資料(図表)を含む複合的読解の初歩",
    prompt:
      "下の表は、あるクラスで「好きな給食」をたずねたアンケートの結果である。カレー:12人、ラーメン:8人、からあげ:7人、その他:3人。この表から読み取れることとして正しいものを選びなさい。",
    choices: [
      { id: "a", label: "一番多くの人が選んだのはカレーである" },
      { id: "b", label: "ラーメンが一番人気である" },
      { id: "c", label: "からあげを選んだ人はいない" },
      { id: "d", label: "その他を選んだ人が一番多い" },
    ],
    correctChoiceId: "a",
    explanation: "表の数を比べると、カレーの12人が一番多い人数です。",
    difficulty: 1,
  },
  {
    id: "japanese-grade5-8",
    subject: "japanese",
    grade: "grade5",
    unit: "資料(図表)を含む複合的読解の初歩",
    prompt:
      "下のグラフは、ある町の一年間の雨の量の変化を月ごとに表したものである。グラフによると、6月と9月に雨の量が多く、1月と2月は雨の量が少ないことが分かる。このグラフの説明として正しいものを選びなさい。",
    choices: [
      { id: "a", label: "6月と9月は雨の量が多く、1月と2月は少ない" },
      { id: "b", label: "一年を通して雨の量はほとんど変わらない" },
      { id: "c", label: "1月が一番雨の量が多い" },
      { id: "d", label: "雨の量は夏よりも冬のほうが多い" },
    ],
    correctChoiceId: "a",
    explanation: "文章に「6月と9月に雨の量が多く、1月と2月は雨の量が少ない」と書かれています。",
    difficulty: 2,
  },

  // --- 敬語の基礎 ---
  {
    id: "japanese-grade5-9",
    subject: "japanese",
    grade: "grade5",
    unit: "敬語の基礎",
    prompt: "先生に自分の意見を伝えるとき、次のうちどの言い方が最もふさわしいですか。",
    choices: [
      { id: "a", label: "先生、わたしはこう思います" },
      { id: "b", label: "おい、おれはこう思う" },
      { id: "c", label: "こう思うんだけど、どう?" },
    ],
    correctChoiceId: "a",
    explanation: "先生など目上の人に話すときは、ていねいな言葉づかいを使います。",
    difficulty: 1,
  },
  {
    id: "japanese-grade5-10",
    subject: "japanese",
    grade: "grade5",
    unit: "敬語の基礎",
    prompt:
      "お客さんが家に来たとき、「これを食べる」という意味をていねいに伝えたい。最もふさわしい言い方はどれですか。",
    choices: [
      { id: "a", label: "どうぞ、めしあがってください" },
      { id: "b", label: "おい、食えよ" },
      { id: "c", label: "食べたきゃ食べれば" },
      { id: "d", label: "これ、食う?" },
    ],
    correctChoiceId: "a",
    explanation:
      "「めしあがる」は「食べる」を敬った言い方(尊敬語)で、お客さんに使うのにふさわしい言葉です。",
    difficulty: 2,
  },

  // --- 慣用句・ことわざ ---
  {
    id: "japanese-grade5-11",
    subject: "japanese",
    grade: "grade5",
    unit: "慣用句・ことわざ",
    prompt: "「猫の手も借りたい」ということわざの意味として正しいものを選びなさい。",
    choices: [
      { id: "a", label: "とてもいそがしくて、だれでもいいから手伝ってほしいこと" },
      { id: "b", label: "猫を飼いたいと思うこと" },
      { id: "c", label: "手伝いがまったく必要ないこと" },
      { id: "d", label: "猫が人の手を借りること" },
    ],
    correctChoiceId: "a",
    explanation: "「猫の手も借りたい」は、とてもいそがしい様子を表すことわざです。",
    difficulty: 1,
  },
  {
    id: "japanese-grade5-12",
    subject: "japanese",
    grade: "grade5",
    unit: "慣用句・ことわざ",
    prompt: "「口が軽い」という慣用句の意味として正しいものを選びなさい。",
    choices: [
      { id: "a", label: "ひみつをすぐに人に話してしまうこと" },
      { id: "b", label: "あまり話さないこと" },
      { id: "c", label: "食べるのが早いこと" },
      { id: "d", label: "口を大きく開けること" },
    ],
    correctChoiceId: "a",
    explanation: "「口が軽い」は、話してはいけないことまでべらべらと話してしまう様子を表します。",
    difficulty: 2,
  },

  // --- 文の成分(主語・述語・修飾語) ---
  {
    id: "japanese-grade5-13",
    subject: "japanese",
    grade: "grade5",
    unit: "文の成分(主語・述語・修飾語)",
    prompt:
      "次の文を読みなさい。「白い犬が、公園を元気に走る。」この文で、「元気に」はどの言葉をくわしくしていますか。",
    choices: [
      { id: "a", label: "走る" },
      { id: "b", label: "白い犬が" },
      { id: "c", label: "公園を" },
      { id: "d", label: "この文" },
    ],
    correctChoiceId: "a",
    explanation: "「元気に」は「走る」のようすをくわしく説明している修飾語です。",
    difficulty: 2,
  },
  {
    id: "japanese-grade5-14",
    subject: "japanese",
    grade: "grade5",
    unit: "文の成分(主語・述語・修飾語)",
    prompt:
      "次の文を読みなさい。「妹は、新しい絵本を静かに読んだ。」この文の主語と述語の組み合わせとして正しいものを選びなさい。",
    choices: [
      { id: "a", label: "主語:妹は 述語:読んだ" },
      { id: "b", label: "主語:絵本を 述語:静かに" },
      { id: "c", label: "主語:新しい 述語:妹は" },
      { id: "d", label: "主語:静かに 述語:絵本を" },
    ],
    correctChoiceId: "a",
    explanation: "「だれが」にあたる「妹は」が主語で、「どうした」にあたる「読んだ」が述語です。",
    difficulty: 3,
  },

  // --- 原因と結果を表す接続語 ---
  {
    id: "japanese-grade5-15",
    subject: "japanese",
    grade: "grade5",
    unit: "原因と結果を表す接続語",
    prompt:
      "台風が近づいてきた。(　　)、遠足は中止になった。(　　)に入る言葉として最もふさわしいものを選びなさい。",
    choices: [
      { id: "a", label: "だから" },
      { id: "b", label: "しかし" },
      { id: "c", label: "たとえば" },
      { id: "d", label: "また" },
    ],
    correctChoiceId: "a",
    explanation: "台風が近づいたという原因があって、遠足中止という結果が起きたので、「だから」が入ります。",
    difficulty: 1,
  },
  {
    id: "japanese-grade5-16",
    subject: "japanese",
    grade: "grade5",
    unit: "原因と結果を表す接続語",
    prompt:
      "毎日こつこつと練習を続けた。(　　)、大会で自分の一番よい記録を出すことができた。(　　)に入る言葉として最もふさわしいものを選びなさい。",
    choices: [
      { id: "a", label: "その結果" },
      { id: "b", label: "ところが" },
      { id: "c", label: "それとも" },
      { id: "d", label: "なぜなら" },
    ],
    correctChoiceId: "a",
    explanation: "練習を続けたことの結果として自分の一番よい記録が出たので、「その結果」が入ります。",
    difficulty: 2,
  },
];

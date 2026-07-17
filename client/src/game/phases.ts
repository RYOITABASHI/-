// client/src/game/phases.ts
//
// ミッションのフェーズ遷移を管理する型・定数。
// docs/game-spec.md「ミッションのフェーズ構成」に対応する。
//
// 仕様書の5フェーズ（降下選択・索敵・ロックオン・再現ボス戦・デブリーフ）に加え、
// 「ミッション開始前の作戦カード選択」を準備フェーズ 'loadout' として先頭に置く
// （spec: 作戦カード＝ロードアウトは「ミッション開始前」に選択する記述のため）。

/** ミッションを構成するフェーズのID。 */
export type MissionPhaseId =
  | "loadout"
  | "dropSelect"
  | "recon"
  | "lockOn"
  | "boss"
  | "debrief";

/** そのフェーズが2D俯瞰表示か3Dレンダリングかを示す。描画負荷の指針(spec参照)。 */
export type RenderMode = "2d" | "3d";

/** どのチームがそのフェーズの画面実装を担当するか。実装計画JSONのtask_*と対応する。 */
export type PhaseOwner = "task_3d_core" | "task_2d_phases" | "task_boss";

export interface MissionPhaseMeta {
  id: MissionPhaseId;
  labelJa: string;
  renderMode: RenderMode;
  owner: PhaseOwner;
  description: string;
}

/** ミッション進行順。配列のインデックス順が唯一の正とする。 */
export const MISSION_PHASE_ORDER: readonly MissionPhaseId[] = [
  "loadout",
  "dropSelect",
  "recon",
  "lockOn",
  "boss",
  "debrief",
];

export const MISSION_PHASE_META: Record<MissionPhaseId, MissionPhaseMeta> = {
  loadout: {
    id: "loadout",
    labelJa: "作戦カード選択",
    renderMode: "3d",
    owner: "task_3d_core",
    description:
      "ミッション開始前に科目別クラス(作戦カード/ロードアウト)を選択する。",
  },
  dropSelect: {
    id: "dropSelect",
    labelJa: "降下選択",
    renderMode: "2d",
    owner: "task_2d_phases",
    description: "俯瞰マップから挑戦エリア(難度/報酬のトレードオフ)を選択する。",
  },
  recon: {
    id: "recon",
    labelJa: "索敵",
    renderMode: "2d",
    owner: "task_2d_phases",
    description:
      "課題文を読み要点を拾う。正解パネルの方角を方位音(簡易版)で把握して選択する。",
  },
  lockOn: {
    id: "lockOn",
    labelJa: "ロックオン",
    renderMode: "3d",
    owner: "task_3d_core",
    description:
      "レール移動+視点操作で妨害ドローン(等速→加速→ジグザグ)を避けつつ、正解パネルを0.3秒の照準保持でロックオンする。",
  },
  boss: {
    id: "boss",
    labelJa: "再現ボス戦",
    // spec上は3D/2D切替可。フェーズ1では実装コストの低い方式をtask_bossが選んでよい。
    // このメタ情報を変更する場合はtask_boss側で実装後にこの値を更新すること。
    renderMode: "2d",
    owner: "task_boss",
    description: "解法・手順を正しい順序で連続入力して再現するミニゲーム。",
  },
  debrief: {
    id: "debrief",
    labelJa: "デブリーフ",
    renderMode: "2d",
    owner: "task_2d_phases",
    description:
      "命中率・先制発見率・エリア内滞在率などのログを表示し、進捗を保存する。",
  },
};

/** 次のフェーズを返す。最終フェーズの場合は null。 */
export function getNextPhase(current: MissionPhaseId): MissionPhaseId | null {
  const idx = MISSION_PHASE_ORDER.indexOf(current);
  if (idx === -1 || idx === MISSION_PHASE_ORDER.length - 1) return null;
  return MISSION_PHASE_ORDER[idx + 1];
}

/** 直前のフェーズを返す。先頭フェーズの場合は null。 */
export function getPreviousPhase(current: MissionPhaseId): MissionPhaseId | null {
  const idx = MISSION_PHASE_ORDER.indexOf(current);
  if (idx <= 0) return null;
  return MISSION_PHASE_ORDER[idx - 1];
}

export function isFirstPhase(phase: MissionPhaseId): boolean {
  return phase === MISSION_PHASE_ORDER[0];
}

export function isLastPhase(phase: MissionPhaseId): boolean {
  return phase === MISSION_PHASE_ORDER[MISSION_PHASE_ORDER.length - 1];
}

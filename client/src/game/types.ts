// client/src/game/types.ts
//
// 学習バトルフィールド (gakushu-fps) — フェーズ1「骨格MVP」共有型定義。
// docs/game-spec.md の仕様に対応する。全チーム共通の契約なので、
// フィールドの追加は歓迎だが、既存フィールドの意味を変える破壊的変更は
// 必ずテックリードと合意の上で行うこと。
//
// このファイルは型・定数のみを置く。ロジック・I/Oは各チームの担当ファイルに実装する。

// ============================================================================
// 基本ドメイン
// ============================================================================

/** 対応科目。フェーズ1は3科目固定。 */
export type Subject = "japanese" | "math" | "english";

export const SUBJECTS: readonly Subject[] = ["japanese", "math", "english"];

export const SUBJECT_LABEL_JA: Record<Subject, string> = {
  japanese: "国語",
  math: "算数",
  english: "英語",
};

/** 対応学年。フェーズ1は小2・小5のみ。 */
export type GradeLevel = "grade2" | "grade5";

export const GRADE_LEVELS: readonly GradeLevel[] = ["grade2", "grade5"];

export const GRADE_LABEL_JA: Record<GradeLevel, string> = {
  grade2: "小学2年生",
  grade5: "小学5年生",
};

/** 問題・エリアの難易度。1=易 3=難。降下選択のリスク/報酬にも流用する。 */
export type Difficulty = 1 | 2 | 3;

// ============================================================================
// プロフィール & 進捗保存 [task_profile が実装]
// 実データは client/src/game/profile/storage.ts の localStorage に保存する。
// ============================================================================

export interface Profile {
  id: string;
  displayName: string;
  grade: GradeLevel;
  /** アバターUI用の識別子。実アセットの割当はtask_profileが決める（絵文字キー等でも可）。 */
  avatarKey: string;
  createdAt: string; // ISO8601文字列
  lastPlayedAt: string | null; // ISO8601文字列
}

/** 階級演出 (README/spec: 訓練生→隊員→…)。学年・科目ごとに独立して管理する。 */
export type RankTier = "recruit" | "trooper" | "specialist" | "veteran" | "ace";

export const RANK_ORDER: readonly RankTier[] = [
  "recruit",
  "trooper",
  "specialist",
  "veteran",
  "ace",
];

export const RANK_LABEL_JA: Record<RankTier, string> = {
  recruit: "訓練生",
  trooper: "隊員",
  specialist: "専門隊員",
  veteran: "熟練隊員",
  ace: "エース",
};

/** 科目×学年×単元 単位での習熟度。弱点把握・再現性確認に使う。 */
export interface TopicMastery {
  subject: Subject;
  grade: GradeLevel;
  unit: string;
  correctCount: number;
  totalCount: number;
  lastAttemptAt: string; // ISO8601文字列
  /** 直近の手順再現(ボス戦)成功可否。null=未挑戦。 */
  lastProcedureReproductionSuccess: boolean | null;
}

/** 1ミッション終了時にデブリーフで確定し、進捗へ追記される履歴レコード。 */
export interface MissionHistoryEntry {
  missionId: string;
  subject: Subject;
  grade: GradeLevel;
  dropZoneId: string;
  loadoutCardId: string;
  completedAt: string; // ISO8601文字列
  summary: MissionSummary;
}

/** プロフィールごとに localStorage へ保存される進捗全体。 */
export interface ProgressRecord {
  profileId: string;
  topicMastery: TopicMastery[];
  missionHistory: MissionHistoryEntry[];
  rank: RankTier;
}

// ============================================================================
// 作戦カード (ロードアウト) [task_3d_core が選択UIとダミーデータを実装]
// ============================================================================

export interface LoadoutCard {
  id: string;
  subject: Subject;
  /** 例: "国語偵察", "算数工兵", "英語通信" */
  name: string;
  description: string;
  /** ロックオン猶予やヒント回数などのゲーム内ボーナス。フェーズ1はダミー値でよい。 */
  perk: {
    extraHint: number;
    lockOnGraceMs: number;
  };
}

// ============================================================================
// 降下選択 [task_2d_phases が選択UIとダミーデータを実装]
// ============================================================================

export interface DropZone {
  id: string;
  name: string;
  subject: Subject;
  grade: GradeLevel;
  difficulty: Difficulty;
  /** 報酬倍率。difficultyと連動させたダミー値でよい（例: 1 -> 1.0, 3 -> 1.5）。 */
  rewardMultiplier: number;
  description: string;
  /** 俯瞰マップ上の位置。0-100のパーセンテージ座標（マップ画像に依存しない相対配置）。 */
  mapPosition: { x: number; y: number };
}

// ============================================================================
// コンテンツ (問題) スキーマ [task_content が実装]
// ============================================================================

export interface QuestionChoice {
  id: string;
  label: string;
}

/** 手順再現ボス戦で要求する1入力ステップ。 */
export interface ProcedureStep {
  id: string;
  /** 1始まりの正しい入力順序。 */
  order: number;
  /** 画面表示するステップの説明・操作対象名（例: "くり上がりを1の位に書く"）。 */
  label: string;
}

export interface ContentItem {
  id: string;
  subject: Subject;
  grade: GradeLevel;
  /** 単元名（例: "たし算の筆算", "説明的文章の要点", "動物の単語"）。 */
  unit: string;
  /** 問題文・課題文。索敵フェーズでは「読んで要点を拾う」対象になる。 */
  prompt: string;
  choices: QuestionChoice[];
  correctChoiceId: string;
  explanation: string;
  hintText?: string;
  difficulty: Difficulty;
  tags?: string[];
}

/** 科目 → 学年 → 問題配列、の形で引きやすくしたコンテンツ全体の型。 */
export type ContentBank = Record<Subject, Record<GradeLevel, ContentItem[]>>;

// ============================================================================
// 索敵フェーズ [task_2d_phases が実装]
// ============================================================================

/** 方位。8方位の簡易実装でよい。 */
export type CompassDirection = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

export const COMPASS_DIRECTIONS: readonly CompassDirection[] = [
  "N",
  "NE",
  "E",
  "SE",
  "S",
  "SW",
  "W",
  "NW",
];

/** 索敵フェーズで1問に紐づく音源提示情報。姿は見せず方位のみ提示する。 */
export interface ReconTarget {
  contentItem: ContentItem;
  direction: CompassDirection;
  /** 演出用のダミー距離（音量や表示サイズの参考値）。 */
  distance: number;
}

export interface ReconPhaseResult {
  contentItemId: string;
  selectedDirection: CompassDirection | null;
  correct: boolean;
  /** 先制発見率の算出用: 音提示から選択までの反応時間(ms)。 */
  reactionTimeMs: number;
}

// ============================================================================
// ロックオンフェーズ [task_3d_core が実装]
// ============================================================================

/** 妨害ドローンの3段階移動パターン（等速→加速→ジグザグ）。 */
export type DroneMovementPattern = "linear" | "accelerating" | "zigzag";

export interface DroneSpec {
  id: string;
  pattern: DroneMovementPattern;
  baseSpeed: number;
  spawnDelayMs: number;
}

/** ロックオン対象となる、選択肢1つに対応するワールド内パネル。 */
export interface LockOnTarget {
  contentItem: ContentItem;
  choiceId: string;
  isCorrect: boolean;
  /** レール移動上のウェイポイントindex、またはワールド座標。3D実装側で解釈する。 */
  position: { x: number; y: number; z: number };
}

/** 照準保持でロックオンが成立するまでの必要時間(ms)。spec: 0.3秒。 */
export const LOCK_ON_HOLD_MS = 300;

export interface LockOnPhaseResult {
  contentItemId: string;
  hitChoiceId: string | null;
  correct: boolean;
  timeToLockMs: number;
  droneHitsTaken: number;
}

// ============================================================================
// 再現ボス戦 [task_boss が実装]
// ============================================================================

export interface BossSequence {
  id: string;
  subject: Subject;
  grade: GradeLevel;
  title: string;
  description: string;
  /** 正しい入力順序。steps[i].order が昇順である前提。 */
  steps: ProcedureStep[];
}

export interface BossPhaseResult {
  bossSequenceId: string;
  success: boolean;
  attempts: number;
  /** 実際に入力された ProcedureStep.id の順序。 */
  inputOrder: string[];
  timeTakenMs: number;
}

// ============================================================================
// デブリーフ・ミッション集計 [task_2d_phases が表示]
// ============================================================================

export interface MissionSummary {
  /** 命中率 (0-1)。 */
  accuracyRate: number;
  /** 先制発見率 (0-1)。索敵フェーズの反応時間から算出する想定。 */
  firstDiscoveryRate: number;
  /** エリア内滞在率 (0-1)。降下選択フェーズの安全ルート判断から算出する想定。 */
  zoneStayRate: number;
  maxCombo: number;
  hintsUsed: number;
  rankAfter: RankTier;
}

// ============================================================================
// ミッション全体の状態
// ミッション実行中の一時状態。永続化は行わず、終了時に MissionSummary を
// 生成して task_profile の ProgressRecord へ書き込む。
// ============================================================================

export interface MissionConfig {
  profileId: string;
  subject: Subject;
  grade: GradeLevel;
  loadoutCardId: string;
  dropZoneId: string;
}

export interface MissionState {
  config: MissionConfig;
  reconResults: ReconPhaseResult[];
  lockOnResults: LockOnPhaseResult[];
  bossResult: BossPhaseResult | null;
  combo: number;
  hintsUsed: number;
}

/** アプリ全体で現在表示している大きな画面区分。 */
export type AppScreen = "profileSelect" | "loadoutSelect" | "mission";

export interface GameState {
  screen: AppScreen;
  activeProfile: Profile | null;
  mission: MissionState | null;
}

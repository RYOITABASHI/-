// client/src/game/profile/storage.ts
//
// [担当: task_profile] 端末内進捗保存 (localStorage)。
// STORAGE_KEYS はこのファイルのみが読み書きの責務を持つ。他チームは
// listProfiles/createProfile/deleteProfile/loadProgress/saveProgress
// の関数経由でのみ利用すること。

import type { GradeLevel, Profile, ProgressRecord } from "@/game/types";

const STORAGE_PREFIX = "gakushu-fps";

export const STORAGE_KEYS = {
  profileList: `${STORAGE_PREFIX}:profiles`,
  progress: (profileId: string) => `${STORAGE_PREFIX}:progress:${profileId}`,
} as const;

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // crypto.randomUUID非対応環境向けの簡易フォールバック。
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function readJson<T>(key: string): T | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage未対応・容量超過などは黙って無視する(ゲーム進行は継続させる)。
  }
}

/** localStorageに保存済みの全プロフィールを読み込む。壊れたデータでも例外を投げず空配列を返す。 */
export function listProfiles(): Profile[] {
  const list = readJson<Profile[]>(STORAGE_KEYS.profileList);
  return Array.isArray(list) ? list : [];
}

function saveProfileList(profiles: Profile[]): void {
  writeJson(STORAGE_KEYS.profileList, profiles);
}

/** 新規プロフィールを作成しlocalStorageへ保存する。 */
export function createProfile(input: {
  displayName: string;
  grade: GradeLevel;
}): Profile {
  const now = new Date().toISOString();
  const profile: Profile = {
    id: generateId(),
    displayName: input.displayName,
    grade: input.grade,
    avatarKey: "default",
    createdAt: now,
    lastPlayedAt: null,
  };
  const profiles = listProfiles();
  profiles.push(profile);
  saveProfileList(profiles);
  return profile;
}

/** プロフィールを削除する(一覧・進捗の両方)。 */
export function deleteProfile(profileId: string): void {
  const profiles = listProfiles().filter((p) => p.id !== profileId);
  saveProfileList(profiles);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(STORAGE_KEYS.progress(profileId));
    }
  } catch {
    // 無視する。
  }
}

/** 指定プロフィールの進捗を読み込む(未保存なら初期値を生成して返す。保存はしない)。 */
export function loadProgress(profileId: string): ProgressRecord {
  const record = readJson<ProgressRecord>(STORAGE_KEYS.progress(profileId));
  if (record) return record;
  return {
    profileId,
    topicMastery: [],
    missionHistory: [],
    rank: "recruit",
  };
}

/** 進捗をlocalStorageへ丸ごと上書き保存する。 */
export function saveProgress(record: ProgressRecord): void {
  writeJson(STORAGE_KEYS.progress(record.profileId), record);
}

/** プロフィールの最終プレイ日時を更新して保存する。 */
export function touchProfileLastPlayed(profileId: string): void {
  const profiles = listProfiles();
  const idx = profiles.findIndex((p) => p.id === profileId);
  if (idx === -1) return;
  profiles[idx] = { ...profiles[idx], lastPlayedAt: new Date().toISOString() };
  saveProfileList(profiles);
}

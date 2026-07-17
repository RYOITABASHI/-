// client/src/game/profile/storage.ts
//
// [担当: task_profile] 端末内進捗保存 (localStorage)。
// 実装ガイドは実装計画JSONの task_profile.instructions を参照。
// 現時点ではスタブ。

import type { GradeLevel, Profile, ProgressRecord } from "@/game/types";

const STORAGE_PREFIX = "gakushu-fps";

export const STORAGE_KEYS = {
  profileList: `${STORAGE_PREFIX}:profiles`,
  progress: (profileId: string) => `${STORAGE_PREFIX}:progress:${profileId}`,
} as const;

/** TODO(task_profile): localStorageに保存済みの全プロフィールを読み込む。 */
export function listProfiles(): Profile[] {
  return [];
}

/** TODO(task_profile): 新規プロフィールを作成しlocalStorageへ保存する。 */
export function createProfile(_input: {
  displayName: string;
  grade: GradeLevel;
}): Profile {
  throw new Error("not implemented");
}

/** TODO(task_profile): プロフィールを削除する。 */
export function deleteProfile(_profileId: string): void {
  throw new Error("not implemented");
}

/** TODO(task_profile): 指定プロフィールの進捗を読み込む(未保存なら初期値を生成して返す)。 */
export function loadProgress(_profileId: string): ProgressRecord {
  throw new Error("not implemented");
}

/** TODO(task_profile): 進捗をlocalStorageへ保存する。 */
export function saveProgress(_record: ProgressRecord): void {
  throw new Error("not implemented");
}

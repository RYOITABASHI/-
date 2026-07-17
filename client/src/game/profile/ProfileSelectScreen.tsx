// client/src/game/profile/ProfileSelectScreen.tsx
//
// [担当: task_profile] プロフィール選択+新規作成画面。
// client/src/pages/Home.tsx から呼び出される想定のエントリーポイント。
// 実装ガイドは実装計画JSONの task_profile.instructions を参照。
// 現時点ではスタブ。

export interface ProfileSelectScreenProps {
  /** プロフィール選択(または新規作成)が完了したら呼ばれる。 */
  onProfileSelected: (profileId: string) => void;
}

export default function ProfileSelectScreen(_props: ProfileSelectScreenProps) {
  return null;
}

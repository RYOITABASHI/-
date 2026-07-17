// client/src/game/profile/ProfileSelectScreen.tsx
//
// [担当: task_profile] プロフィール選択+新規作成画面。
// client/src/pages/Home.tsx から呼び出される想定のエントリーポイント。

import { useState, type FormEvent } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  GRADE_LABEL_JA,
  GRADE_LEVELS,
  RANK_LABEL_JA,
  type GradeLevel,
  type Profile,
} from "@/game/types";
import {
  createProfile,
  listProfiles,
  loadProgress,
  touchProfileLastPlayed,
} from "@/game/profile/storage";

export interface ProfileSelectScreenProps {
  /** プロフィール選択(または新規作成)が完了したら呼ばれる。 */
  onProfileSelected: (profileId: string) => void;
}

export default function ProfileSelectScreen({
  onProfileSelected,
}: ProfileSelectScreenProps) {
  const [profiles, setProfiles] = useState<Profile[]>(() => listProfiles());
  const [displayName, setDisplayName] = useState("");
  const [grade, setGrade] = useState<GradeLevel>(GRADE_LEVELS[0]);

  function handleSelect(profile: Profile) {
    touchProfileLastPlayed(profile.id);
    onProfileSelected(profile.id);
  }

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    const name = displayName.trim();
    if (!name) return;
    const profile = createProfile({ displayName: name, grade });
    setProfiles((prev) => [...prev, profile]);
    onProfileSelected(profile.id);
  }

  return (
    <div className="min-h-screen flex flex-col items-center gap-8 p-6">
      <h1 className="text-2xl font-bold">プロフィール選択</h1>

      {profiles.length > 0 && (
        <div className="grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
          {profiles.map((profile) => {
            const rank = loadProgress(profile.id).rank;
            return (
              <Card
                key={profile.id}
                role="button"
                tabIndex={0}
                onClick={() => handleSelect(profile)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") handleSelect(profile);
                }}
                className="cursor-pointer transition-colors hover:bg-accent"
              >
                <CardHeader>
                  <CardTitle>{profile.displayName}</CardTitle>
                  <CardDescription>{GRADE_LABEL_JA[profile.grade]}</CardDescription>
                </CardHeader>
                <CardContent>
                  <span className="inline-block rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
                    {RANK_LABEL_JA[rank]}
                  </span>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>新規プロフィール作成</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleCreate}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="displayName">表示名</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="なまえ"
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>学年</Label>
              <RadioGroup
                value={grade}
                onValueChange={(value) => setGrade(value as GradeLevel)}
              >
                {GRADE_LEVELS.map((g) => (
                  <div key={g} className="flex items-center gap-2">
                    <RadioGroupItem value={g} id={`grade-${g}`} />
                    <Label htmlFor={`grade-${g}`}>{GRADE_LABEL_JA[g]}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <Button type="submit">作成してはじめる</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

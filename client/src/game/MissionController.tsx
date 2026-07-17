// client/src/game/MissionController.tsx
//
// [担当: task_profile] アプリ全体のGameStateを保持するトップレベルコンポーネント。
// プロフィール選択 -> 作戦カード選択 -> ミッション各フェーズ -> デブリーフ ->
// プロフィール選択、という画面遷移全体を配線する。
// 各フェーズの実画面は他チーム(task_2d_phases/task_3d_core/task_boss)が
// 実装する。着手時点ではスタブ(nullを返す)でもコンパイルが通ることを前提にする。

import { useState } from "react";
import { ProfileSelectScreen } from "@/game/profile";
import { listProfiles, loadProgress, saveProgress } from "@/game/profile/storage";
import { LoadoutSelectScreen, LockOnScene, getLoadoutCardsBySubject } from "@/game/phase3d";
import { DropSelectScreen, ReconScreen, DebriefScreen, getDropZonesBySubjectGrade } from "@/game/phases2d";
import { BossSequenceGame, DUMMY_BOSS_SEQUENCES } from "@/game/boss";
import { getRandomQuestions } from "@/game/content";
import { getNextPhase } from "@/game/phases";
import type { MissionPhaseId } from "@/game/phases";
import {
  RANK_ORDER,
  type BossPhaseResult,
  type GameState,
  type LockOnPhaseResult,
  type MissionHistoryEntry,
  type MissionSummary,
  type Profile,
  type ReconPhaseResult,
  type Subject,
} from "@/game/types";

/** フェーズ2で科目選択UIが実装されるまでの暫定固定値。 */
const PLACEHOLDER_SUBJECT: Subject = "math";

const RECON_QUESTION_COUNT = 5;
const LOCK_ON_QUESTION_COUNT = 5;

function computeMissionSummary(
  reconResults: ReconPhaseResult[],
  lockOnResults: LockOnPhaseResult[],
  combo: number,
  hintsUsed: number,
  currentRank: (typeof RANK_ORDER)[number],
): MissionSummary {
  const accuracyRate =
    lockOnResults.length > 0
      ? lockOnResults.filter((r) => r.correct).length / lockOnResults.length
      : 0;
  const firstDiscoveryRate =
    reconResults.length > 0
      ? reconResults.filter((r) => r.correct).length / reconResults.length
      : 0;
  // ダミー値: 降下選択フェーズの安全ルート判断ロジックは未実装のため固定値とする。
  const zoneStayRate = 0.8;

  // 簡易ランクアップ判定: 命中率8割以上で1段階昇格、それ以外は維持。
  const currentIdx = RANK_ORDER.indexOf(currentRank);
  const rankAfter =
    accuracyRate >= 0.8 && currentIdx < RANK_ORDER.length - 1
      ? RANK_ORDER[currentIdx + 1]
      : currentRank;

  return {
    accuracyRate,
    firstDiscoveryRate,
    zoneStayRate,
    maxCombo: combo,
    hintsUsed,
    rankAfter,
  };
}

export default function MissionController() {
  const [gameState, setGameState] = useState<GameState>({
    screen: "profileSelect",
    activeProfile: null,
    mission: null,
  });
  const [currentPhase, setCurrentPhase] = useState<MissionPhaseId>("loadout");

  function handleProfileSelected(profileId: string) {
    // プロフィールカード自体はProfileSelectScreen側でlastPlayedAtを更新済みなので、
    // ここでは最新の一覧から該当プロフィールを取り直す。
    const profiles = listProfiles();
    const profile = profiles.find((p) => p.id === profileId) ?? null;
    setGameState({
      screen: "loadoutSelect",
      activeProfile: profile,
      mission: null,
    });
    setCurrentPhase("loadout");
  }

  function handleLoadoutSelected(loadoutCardId: string) {
    if (!gameState.activeProfile) return;
    const profile = gameState.activeProfile;
    const dropZones = getDropZonesBySubjectGrade(PLACEHOLDER_SUBJECT, profile.grade);
    const dropZoneId = dropZones[0]?.id ?? "";
    setGameState({
      screen: "mission",
      activeProfile: profile,
      mission: {
        config: {
          profileId: profile.id,
          subject: PLACEHOLDER_SUBJECT,
          grade: profile.grade,
          loadoutCardId,
          dropZoneId,
        },
        reconResults: [],
        lockOnResults: [],
        bossResult: null,
        combo: 0,
        hintsUsed: 0,
      },
    });
    setCurrentPhase(getNextPhase("loadout") ?? "dropSelect");
  }

  function handleDropSelected(dropZoneId: string) {
    setGameState((prev) =>
      prev.mission
        ? { ...prev, mission: { ...prev.mission, config: { ...prev.mission.config, dropZoneId } } }
        : prev,
    );
    setCurrentPhase((phase) => getNextPhase(phase) ?? phase);
  }

  function handleReconComplete(results: ReconPhaseResult[]) {
    setGameState((prev) =>
      prev.mission ? { ...prev, mission: { ...prev.mission, reconResults: results } } : prev,
    );
    setCurrentPhase((phase) => getNextPhase(phase) ?? phase);
  }

  function handleLockOnComplete(results: LockOnPhaseResult[]) {
    // 簡易コンボ計算: 連続正解数の最大値。
    const maxStreak = results.reduce(
      (acc, r) => {
        const streak = r.correct ? acc.streak + 1 : 0;
        return { streak, max: Math.max(acc.max, streak) };
      },
      { streak: 0, max: 0 },
    ).max;
    setGameState((prev) =>
      prev.mission
        ? {
            ...prev,
            mission: {
              ...prev.mission,
              lockOnResults: results,
              combo: Math.max(prev.mission.combo, maxStreak),
            },
          }
        : prev,
    );
    setCurrentPhase((phase) => getNextPhase(phase) ?? phase);
  }

  function handleBossComplete(result: BossPhaseResult) {
    setGameState((prev) =>
      prev.mission ? { ...prev, mission: { ...prev.mission, bossResult: result } } : prev,
    );
    setCurrentPhase((phase) => getNextPhase(phase) ?? phase);
  }

  function handleDebriefFinish() {
    const { activeProfile, mission } = gameState;
    if (activeProfile && mission) {
      const progress = loadProgress(activeProfile.id);
      const summary = computeMissionSummary(
        mission.reconResults,
        mission.lockOnResults,
        mission.combo,
        mission.hintsUsed,
        progress.rank,
      );
      const entry: MissionHistoryEntry = {
        missionId: `${mission.config.subject}-${Date.now()}`,
        subject: mission.config.subject,
        grade: mission.config.grade,
        dropZoneId: mission.config.dropZoneId,
        loadoutCardId: mission.config.loadoutCardId,
        completedAt: new Date().toISOString(),
        summary,
      };
      saveProgress({
        ...progress,
        rank: summary.rankAfter,
        missionHistory: [...progress.missionHistory, entry],
      });
    }
    setGameState({ screen: "profileSelect", activeProfile: null, mission: null });
    setCurrentPhase("loadout");
  }

  if (gameState.screen === "profileSelect") {
    return <ProfileSelectScreen onProfileSelected={handleProfileSelected} />;
  }

  if (gameState.screen === "loadoutSelect") {
    const cards = getLoadoutCardsBySubject(PLACEHOLDER_SUBJECT);
    return <LoadoutSelectScreen cards={cards} onSelect={handleLoadoutSelected} />;
  }

  // gameState.screen === 'mission'
  const mission = gameState.mission;
  if (!mission) return null;

  switch (currentPhase) {
    case "loadout": {
      const cards = getLoadoutCardsBySubject(mission.config.subject);
      return <LoadoutSelectScreen cards={cards} onSelect={handleLoadoutSelected} />;
    }
    case "dropSelect": {
      const dropZones = getDropZonesBySubjectGrade(mission.config.subject, mission.config.grade);
      return <DropSelectScreen dropZones={dropZones} onSelect={handleDropSelected} />;
    }
    case "recon": {
      const questions = getRandomQuestions(
        mission.config.subject,
        mission.config.grade,
        RECON_QUESTION_COUNT,
      );
      return <ReconScreen questions={questions} onComplete={handleReconComplete} />;
    }
    case "lockOn": {
      const questions = getRandomQuestions(
        mission.config.subject,
        mission.config.grade,
        LOCK_ON_QUESTION_COUNT,
      );
      return <LockOnScene questions={questions} onComplete={handleLockOnComplete} />;
    }
    case "boss": {
      const sequence =
        DUMMY_BOSS_SEQUENCES.find(
          (s) => s.subject === mission.config.subject && s.grade === mission.config.grade,
        ) ?? DUMMY_BOSS_SEQUENCES[0];
      if (!sequence) return null;
      return <BossSequenceGame sequence={sequence} onComplete={handleBossComplete} />;
    }
    case "debrief": {
      const progress = loadProgress(mission.config.profileId);
      const summary = computeMissionSummary(
        mission.reconResults,
        mission.lockOnResults,
        mission.combo,
        mission.hintsUsed,
        progress.rank,
      );
      return <DebriefScreen summary={summary} onFinish={handleDebriefFinish} />;
    }
    default:
      return null;
  }
}

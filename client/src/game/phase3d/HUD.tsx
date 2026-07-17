// client/src/game/phase3d/HUD.tsx
//
// [担当: task_3d_core] HUDオーバーレイ(照準、残り試行回数、制限時間ゲージ、
// ミニマップ)。Babylon Canvasの上に重ねるDOM要素として実装する想定
// (パフォーマンス方針によりBabylon GUIは使わない)。
// 実装ガイドは実装計画JSONの task_3d_core.instructions を参照。
// 現時点ではスタブ。

export interface HUDProps {
  remainingAttempts: number;
  timeRemainingMs: number;
  combo: number;
}

export default function HUD(_props: HUDProps) {
  return null;
}

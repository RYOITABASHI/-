// client/src/game/phases2d/DropSelectScreen.tsx
//
// [担当: task_2d_phases] ①降下選択フェーズ(2D俯瞰マップ)。
// docs/game-spec.md「① 降下選択」参照。描画負荷「極小」要件のため、
// 3D描画は使わず単色背景divへの絶対配置ボタンのみで構成する。

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SUBJECT_LABEL_JA, GRADE_LABEL_JA, type DropZone } from "@/game/types";

export interface DropSelectScreenProps {
  dropZones: DropZone[];
  onSelect: (dropZoneId: string) => void;
}

function DifficultyStars({ difficulty }: { difficulty: DropZone["difficulty"] }) {
  return (
    <span aria-label={`難度${difficulty}`} className="tracking-tight text-amber-400">
      {"★".repeat(difficulty)}
      <span className="text-muted-foreground">{"★".repeat(3 - difficulty)}</span>
    </span>
  );
}

export default function DropSelectScreen({ dropZones, onSelect }: DropSelectScreenProps) {
  return (
    <div className="flex min-h-svh flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">降下選択</h1>
        <p className="text-sm text-muted-foreground">
          挑戦エリアを選んでください。難度が高いほど報酬倍率が上がります。
        </p>
      </div>

      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-950 sm:aspect-[16/9]">
        {dropZones.map((zone) => (
          <button
            key={zone.id}
            type="button"
            onClick={() => onSelect(zone.id)}
            style={{ left: `${zone.mapPosition.x}%`, top: `${zone.mapPosition.y}%` }}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-lg border border-emerald-400/40 bg-slate-900/80 px-2 py-1.5 text-left shadow-lg backdrop-blur-sm transition-transform hover:z-10 hover:scale-105 hover:border-emerald-300 focus-visible:z-10 focus-visible:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
          >
            <div className="text-xs font-semibold text-emerald-100 sm:text-sm">{zone.name}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[10px] sm:text-xs">
              <DifficultyStars difficulty={zone.difficulty} />
              <Badge variant="secondary" className="text-[10px]">
                x{zone.rewardMultiplier.toFixed(2)}
              </Badge>
            </div>
          </button>
        ))}
      </div>

      {dropZones.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          この科目・学年の挑戦エリアが見つかりませんでした。
        </p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">エリア一覧</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {dropZones.map((zone) => (
              <button
                key={zone.id}
                type="button"
                onClick={() => onSelect(zone.id)}
                className="flex flex-col gap-1 rounded-md border p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{zone.name}</span>
                  <DifficultyStars difficulty={zone.difficulty} />
                </div>
                <p className="text-xs text-muted-foreground">{zone.description}</p>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{SUBJECT_LABEL_JA[zone.subject]}</span>
                  <span>/</span>
                  <span>{GRADE_LABEL_JA[zone.grade]}</span>
                  <Badge variant="outline" className="ml-auto">
                    報酬 x{zone.rewardMultiplier.toFixed(2)}
                  </Badge>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// client/src/game/phases2d/DropSelectScreen.tsx
//
// [担当: task_2d_phases] ①降下選択フェーズ(2D俯瞰マップ)。
// docs/game-spec.md「① 降下選択」参照。描画負荷「極小」要件のため、
// 3D描画は使わずCSS/SVGアニメーション+絶対配置ボタンのみで構成する。
// 2026-07-17: 保護者判断によりPUBGモバイル風の演出を許容する方針に転換
// (docs/game-spec.md改訂参照)。輸送機の飛行・パラシュート降下演出を追加する。

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SUBJECT_LABEL_JA, GRADE_LABEL_JA, type DropZone } from "@/game/types";
import { startTransportDrone, playParachuteWindSound } from "@/game/phases2d/dropAmbience";

export interface DropSelectScreenProps {
  dropZones: DropZone[];
  onSelect: (dropZoneId: string) => void;
}

/** 降下演出の所要時間(ms)。選択〜onSelect呼び出しまでの間、他ボタンを無効化する。 */
const DESCENT_DURATION_MS = 1300;

interface DescentState {
  zoneId: string;
  zoneName: string;
  x: number;
  y: number;
}

function DifficultyStars({ difficulty }: { difficulty: DropZone["difficulty"] }) {
  return (
    <span aria-label={`難度${difficulty}`} className="tracking-tight text-amber-400">
      {"★".repeat(difficulty)}
      <span className="text-muted-foreground">{"★".repeat(3 - difficulty)}</span>
    </span>
  );
}

/** 汎用的な貨物輸送機のシルエット(実在機を模さない簡略形状)。 */
function TransportPlaneIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 48" className={className} fill="currentColor" aria-hidden="true">
      <path d="M6 26 Q6 20 16 20 L82 20 Q94 20 99 25 L104 26 L99 27 Q94 32 82 32 L16 32 Q6 32 6 26 Z" />
      <path d="M42 20 L28 3 L38 3 L56 20 Z" />
      <path d="M42 32 L28 45 L38 45 L56 32 Z" />
      <path d="M15 21 L4 10 L12 10 L23 21 Z" />
      <path d="M15 31 L4 40 L12 40 L23 31 Z" />
      <path d="M10 20 L10 7 L19 20 Z" />
    </svg>
  );
}

/** パラシュート+人型シルエット(簡略化、流血・グロ表現なし)。 */
function ParachuteIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 56" className={className} aria-hidden="true">
      <path
        d="M2 15 A18 14 0 0 1 38 15 Q34 10 20 10 Q6 10 2 15 Z"
        fill="currentColor"
        opacity={0.95}
      />
      <line x1="4" y1="15" x2="17" y2="31" stroke="currentColor" strokeWidth="1.2" />
      <line x1="20" y1="12" x2="19" y2="31" stroke="currentColor" strokeWidth="1.2" />
      <line x1="36" y1="15" x2="22" y2="31" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="19.5" cy="35" r="3" fill="currentColor" />
      <path
        d="M19.5 38 L19.5 46 M19.5 40.5 L14 44 M19.5 40.5 L25 44 M19.5 46 L15 54 M19.5 46 L24 54"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export default function DropSelectScreen({ dropZones, onSelect }: DropSelectScreenProps) {
  const [descent, setDescent] = useState<DescentState | null>(null);
  const droneHandleRef = useRef<{ stop: () => void } | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    droneHandleRef.current = startTransportDrone();
    return () => {
      droneHandleRef.current?.stop();
      droneHandleRef.current = null;
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  function handleZoneSelect(zone: DropZone) {
    if (descent) return; // 演出中は二重クリックを無視する
    setDescent({
      zoneId: zone.id,
      zoneName: zone.name,
      x: zone.mapPosition.x,
      y: zone.mapPosition.y,
    });
    playParachuteWindSound();
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      onSelect(zone.id);
    }, DESCENT_DURATION_MS);
  }

  const isDescending = descent !== null;

  return (
    <div className="flex min-h-svh flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">降下選択</h1>
        <p className="text-sm text-muted-foreground">
          挑戦エリアを選んでください。難度が高いほど報酬倍率が上がります。
        </p>
      </div>

      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-amber-900/50 bg-gradient-to-br from-[#4a4326] via-[#3a3521] to-[#242013] sm:aspect-[16/9]">
        {/* 等高線風の装飾(視認性を損なわないよう低不透明度) */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-[12%] top-[65%] h-36 w-36 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-100/15 sm:h-44 sm:w-44" />
          <div className="absolute left-[12%] top-[65%] h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-100/10 sm:h-64 sm:w-64" />
          <div className="absolute left-[75%] top-[22%] h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-100/10 sm:h-48 sm:w-48" />
          <div
            className="absolute inset-0 opacity-[0.12]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(226,199,138,0.5)_1px,transparent_1px)," +
                "linear-gradient(90deg,rgba(226,199,138,0.5)_1px,transparent_1px)",
              backgroundSize: "7% 10%",
            }}
          />
        </div>

        {/* 輸送機の飛行演出(ループ) */}
        <div className="drop-select-plane pointer-events-none absolute top-[10%] text-amber-100/70 sm:top-[12%]">
          <TransportPlaneIcon className="h-6 w-16 drop-shadow-md sm:h-8 sm:w-20" />
        </div>

        {dropZones.map((zone) => (
          <button
            key={zone.id}
            type="button"
            onClick={() => handleZoneSelect(zone)}
            disabled={isDescending}
            style={{ left: `${zone.mapPosition.x}%`, top: `${zone.mapPosition.y}%` }}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-lg border border-amber-400/40 bg-slate-900/80 px-2 py-1.5 text-left shadow-lg backdrop-blur-sm transition-transform hover:z-10 hover:scale-105 hover:border-amber-300 focus-visible:z-10 focus-visible:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
          >
            <div className="text-xs font-semibold text-amber-100 sm:text-sm">{zone.name}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[10px] sm:text-xs">
              <DifficultyStars difficulty={zone.difficulty} />
              <Badge variant="secondary" className="text-[10px]">
                x{zone.rewardMultiplier.toFixed(2)}
              </Badge>
            </div>
          </button>
        ))}

        {/* パラシュート降下トランジション */}
        <AnimatePresence>
          {descent && (
            <motion.div
              key={descent.zoneId}
              className="pointer-events-none absolute z-30 -translate-x-1/2 text-amber-50"
              style={{ left: `${descent.x}%` }}
              initial={{ top: "-24%", opacity: 0, scale: 0.55 }}
              animate={{ top: `${descent.y}%`, opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DESCENT_DURATION_MS / 1000, ease: "easeIn" }}
            >
              <motion.div
                animate={{ x: [-6, 6, -3, 3, 0] }}
                transition={{ duration: DESCENT_DURATION_MS / 1000, ease: "easeInOut" }}
              >
                <ParachuteIcon className="h-10 w-10 -translate-y-full drop-shadow-lg sm:h-12 sm:w-12" />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {descent && (
          <div className="pointer-events-none absolute left-1/2 top-2 z-30 -translate-x-1/2 rounded-full border border-amber-300/50 bg-slate-950/80 px-3 py-1 text-[11px] font-medium text-amber-100 shadow-md sm:text-xs">
            {descent.zoneName} へ降下中…
          </div>
        )}
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
                onClick={() => handleZoneSelect(zone)}
                disabled={isDescending}
                className="flex flex-col gap-1 rounded-md border p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
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

      <style>{`
        .drop-select-plane {
          left: -18%;
          animation: drop-select-plane-fly 24s linear infinite;
        }
        @keyframes drop-select-plane-fly {
          0% { left: -18%; }
          100% { left: 118%; }
        }
        @media (prefers-reduced-motion: reduce) {
          .drop-select-plane {
            animation: none;
            left: 40%;
          }
        }
      `}</style>
    </div>
  );
}

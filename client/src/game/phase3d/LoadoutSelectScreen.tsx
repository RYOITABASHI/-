// client/src/game/phase3d/LoadoutSelectScreen.tsx
//
// [担当: task_3d_core] 作戦カード(ロードアウト)選択画面。
// MVPはDOM/2D UIで実装(phases.ts の renderMode は目安)。
// PUBGモバイル風の「武器選択」画面を意識した見た目(docs/game-spec.md参照)。
// 3D描画は使わず、DOM/CSS/SVGのみで武器種のフレーバー・ステータスバー・
// アイコンを表現する(LoadoutCard型/props自体は変更しない)。

import type { ComponentType } from "react";
import { SUBJECT_LABEL_JA, type LoadoutCard, type Subject } from "@/game/types";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface LoadoutSelectScreenProps {
  cards: LoadoutCard[];
  onSelect: (loadoutCardId: string) => void;
}

// ----------------------------------------------------------------------------
// 武器クラスのフレーバー付け
//
// LoadoutCard型・perkのデータ構造は変更せず、科目(subject)に対して
// 表示上の「武器種」の性格付けをマッピングするだけの純粋な表示ロジック。
// 実在の銃器名・ロゴは使わず、ジャンル・性格の演出に留める。
// ----------------------------------------------------------------------------

type WeaponClass = "sniper" | "assault" | "smg";

const WEAPON_CLASS_BY_SUBJECT: Record<Subject, WeaponClass> = {
  japanese: "sniper", // 遠距離・精密射撃タイプ(ボルトアクション的性格)
  math: "assault", // 汎用バランス型(手順を組み立てる正確な操作)
  english: "smg", // 近~中距離・速射タイプ
};

interface WeaponClassMeta {
  label: string;
  tagline: string;
  Icon: ComponentType<{ className?: string }>;
  /** カードの枠・影(hover/focus時)。variantごとに完全な文字列で保持し、
   * Tailwindのクラス検出(静的スキャン)を確実に効かせる。 */
  cardActiveClass: string;
  topBarClass: string;
  iconWrapClass: string;
  tagClass: string;
  barClass: string;
}

const WEAPON_CLASS_META: Record<WeaponClass, WeaponClassMeta> = {
  sniper: {
    label: "精密射撃",
    tagline: "ボルトアクション式・遠距離特化",
    Icon: SniperIcon,
    cardActiveClass:
      "hover:-translate-y-1 hover:border-amber-400/80 hover:shadow-[0_0_0_1px_rgba(251,191,36,0.35),0_16px_32px_-16px_rgba(251,191,36,0.45)] focus-visible:-translate-y-1 focus-visible:border-amber-400/80 focus-visible:shadow-[0_0_0_1px_rgba(251,191,36,0.35),0_16px_32px_-16px_rgba(251,191,36,0.45)]",
    topBarClass: "bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500/40",
    iconWrapClass: "bg-amber-400/10 text-amber-400 ring-1 ring-amber-400/30",
    tagClass: "border-amber-400/40 bg-amber-400/10 text-amber-300",
    barClass: "bg-amber-400",
  },
  assault: {
    label: "汎用アサルト",
    tagline: "バランス型・手順制御",
    Icon: AssaultIcon,
    cardActiveClass:
      "hover:-translate-y-1 hover:border-emerald-400/80 hover:shadow-[0_0_0_1px_rgba(52,211,153,0.35),0_16px_32px_-16px_rgba(52,211,153,0.45)] focus-visible:-translate-y-1 focus-visible:border-emerald-400/80 focus-visible:shadow-[0_0_0_1px_rgba(52,211,153,0.35),0_16px_32px_-16px_rgba(52,211,153,0.45)]",
    topBarClass:
      "bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-500/40",
    iconWrapClass: "bg-emerald-400/10 text-emerald-400 ring-1 ring-emerald-400/30",
    tagClass: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
    barClass: "bg-emerald-400",
  },
  smg: {
    label: "近接速射",
    tagline: "サブマシンガン式・近~中距離",
    Icon: SmgIcon,
    cardActiveClass:
      "hover:-translate-y-1 hover:border-sky-400/80 hover:shadow-[0_0_0_1px_rgba(56,189,248,0.35),0_16px_32px_-16px_rgba(56,189,248,0.45)] focus-visible:-translate-y-1 focus-visible:border-sky-400/80 focus-visible:shadow-[0_0_0_1px_rgba(56,189,248,0.35),0_16px_32px_-16px_rgba(56,189,248,0.45)]",
    topBarClass: "bg-gradient-to-r from-sky-500 via-sky-400 to-sky-500/40",
    iconWrapClass: "bg-sky-400/10 text-sky-400 ring-1 ring-sky-400/30",
    tagClass: "border-sky-400/40 bg-sky-400/10 text-sky-300",
    barClass: "bg-sky-400",
  },
};

// ----------------------------------------------------------------------------
// ステータスバー算出(perkの既存データから相対値を導出。表示上の演出であり
// perk自体の意味・型は変更しない)
// ----------------------------------------------------------------------------

const MAX_LOCK_ON_GRACE_MS = 120;
const MAX_EXTRA_HINT = 3;
const POWER_BY_WEAPON_CLASS: Record<WeaponClass, number> = {
  sniper: 90,
  assault: 65,
  smg: 45,
};

interface StatBarData {
  key: string;
  label: string;
  value: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function derivePerkStats(
  card: LoadoutCard,
  weaponClass: WeaponClass
): StatBarData[] {
  const { extraHint, lockOnGraceMs } = card.perk;

  const stability = clamp(
    Math.round((lockOnGraceMs / MAX_LOCK_ON_GRACE_MS) * 100),
    10,
    100
  );
  const rateOfFire = clamp(
    Math.round(100 - (lockOnGraceMs / MAX_LOCK_ON_GRACE_MS) * 100),
    10,
    100
  );
  const support = clamp(Math.round((extraHint / MAX_EXTRA_HINT) * 100), 10, 100);
  const power = POWER_BY_WEAPON_CLASS[weaponClass];

  return [
    { key: "stability", label: "命中安定性", value: stability },
    { key: "rate", label: "速射性", value: rateOfFire },
    { key: "support", label: "ヒント支援", value: support },
    { key: "power", label: "威力", value: power },
  ];
}

function StatBar({
  label,
  value,
  barClass,
}: {
  label: string;
  value: number;
  barClass: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-[11px] text-slate-400">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
        <div
          className={cn("h-full rounded-full", barClass)}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

export default function LoadoutSelectScreen({
  cards,
  onSelect,
}: LoadoutSelectScreenProps) {
  return (
    <div className="flex min-h-full w-full flex-col items-center justify-center gap-6 bg-slate-950 p-6 text-white">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-wide">武器選択</h1>
        <p className="mt-1 text-sm text-slate-400">
          科目別クラス(作戦カード)を選んでミッションを開始します。
        </p>
      </div>

      <div className="grid w-full max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const weaponClass = WEAPON_CLASS_BY_SUBJECT[card.subject];
          const meta = WEAPON_CLASS_META[weaponClass];
          const stats = derivePerkStats(card, weaponClass);
          const Icon = meta.Icon;

          return (
            <button
              key={card.id}
              type="button"
              onClick={() => onSelect(card.id)}
              className="group text-left focus:outline-none"
            >
              <Card
                className={cn(
                  "relative h-full overflow-hidden border-slate-700 bg-slate-900 text-white transition-all duration-150",
                  "active:translate-y-0 active:scale-[0.99]",
                  meta.cardActiveClass
                )}
              >
                {/* 稀少度風アクセントの上部バー */}
                <div
                  className={cn("absolute inset-x-0 top-0 h-1", meta.topBarClass)}
                  aria-hidden="true"
                />

                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-lg">{card.name}</CardTitle>
                    <Badge variant="secondary">
                      {SUBJECT_LABEL_JA[card.subject]}
                    </Badge>
                  </div>

                  {/* 武器アイコン + 武器種タグ */}
                  <div className="flex items-center gap-3 pt-1">
                    <div
                      className={cn(
                        "flex h-11 w-16 shrink-0 items-center justify-center rounded-md",
                        meta.iconWrapClass
                      )}
                    >
                      <Icon className="h-6 w-11" />
                    </div>
                    <div className="min-w-0">
                      <span
                        className={cn(
                          "inline-block rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide",
                          meta.tagClass
                        )}
                      >
                        {meta.label}
                      </span>
                      <p className="mt-1 truncate text-[11px] text-slate-500">
                        {meta.tagline}
                      </p>
                    </div>
                  </div>

                  <CardDescription className="text-slate-400">
                    {card.description}
                  </CardDescription>

                  {/* PUBG風のステータスバー */}
                  <div className="mt-2 flex flex-col gap-1.5">
                    {stats.map((stat) => (
                      <StatBar
                        key={stat.key}
                        label={stat.label}
                        value={stat.value}
                        barClass={meta.barClass}
                      />
                    ))}
                  </div>

                  <div className="mt-1 flex gap-3 text-[11px] text-slate-500">
                    <span>ヒント +{card.perk.extraHint}</span>
                    <span>ロック猶予 {card.perk.lockOnGraceMs}ms</span>
                  </div>
                </CardHeader>
              </Card>
            </button>
          );
        })}
      </div>

      {cards.length === 0 && (
        <p className="text-sm text-slate-400">利用可能な作戦カードがありません。</p>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// 武器種シルエットアイコン(抽象化したSVG。実在の銃器グラフィックではない)
// ----------------------------------------------------------------------------

function SniperIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 40"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      {/* 長い銃身 */}
      <rect x="4" y="17" width="66" height="4" rx="2" />
      {/* スコープ */}
      <rect x="56" y="6" width="26" height="6" rx="2" opacity="0.9" />
      <rect x="60" y="12" width="3" height="5" />
      <rect x="76" y="12" width="3" height="5" />
      {/* レシーバー */}
      <rect x="68" y="14" width="26" height="12" rx="3" />
      {/* ストック */}
      <path d="M92 16 L112 10 L112 26 L92 24 Z" />
      {/* グリップ */}
      <rect x="86" y="24" width="7" height="11" rx="2" />
    </svg>
  );
}

function AssaultIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 40"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      {/* 中間長の銃身 */}
      <rect x="8" y="17" width="42" height="4" rx="2" />
      {/* ハンドガード */}
      <rect x="42" y="14" width="20" height="9" rx="2" opacity="0.9" />
      {/* レシーバー */}
      <rect x="62" y="12" width="26" height="13" rx="3" />
      {/* 角度付きマガジン */}
      <path d="M68 25 L82 25 L78 38 L70 34 Z" />
      {/* ストック */}
      <rect x="88" y="15" width="20" height="6" rx="2" />
      {/* グリップ */}
      <rect x="80" y="25" width="7" height="10" rx="2" />
    </svg>
  );
}

function SmgIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 40"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      {/* 短い銃身 */}
      <rect x="18" y="17" width="20" height="4" rx="2" />
      {/* コンパクトなレシーバー */}
      <rect x="36" y="13" width="30" height="11" rx="3" />
      {/* 直線的な長めマガジン */}
      <rect x="44" y="24" width="9" height="16" rx="2" />
      {/* 折り畳み式ストック */}
      <path d="M66 15 L88 12 L88 22 L66 21 Z" />
      {/* グリップ */}
      <rect x="58" y="24" width="7" height="10" rx="2" />
    </svg>
  );
}

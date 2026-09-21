"use client";

import { ChevronDown, NotebookPen } from "lucide-react";
import { useState } from "react";
import type { CueCard } from "@/lib/exam/types";
import { useI18n } from "@/lib/i18n";
import { cn, formatClock } from "@/lib/utils";
import { useNow } from "./hooks";

function Ring({ progress, label, tone }: { progress: number; label: string; tone: "warn" | "accent" }) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative grid size-[68px] shrink-0 place-items-center">
      <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90">
        <circle cx="32" cy="32" r={radius} fill="none" strokeWidth="4" className="stroke-muted" />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.min(1, Math.max(0, progress)))}
          className={cn("transition-[stroke-dashoffset] duration-300", tone === "warn" ? "stroke-warn" : "stroke-accent")}
        />
      </svg>
      <span className="text-sm font-semibold tabular-nums">{label}</span>
    </div>
  );
}

export function CueCardPanel({
  card,
  prep,
  talk,
  onReady,
}: {
  card: CueCard;
  prep: { endsAt: number; total: number } | null;
  talk: { startedAt: number; total: number } | null;
  onReady: () => void;
}) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const now = useNow(250, Boolean(prep || talk));

  const prepLeft = prep ? Math.min(prep.total, Math.max(0, Math.ceil((prep.endsAt - now) / 1000))) : 0;
  const talkElapsed = talk ? Math.max(0, Math.floor((now - talk.startedAt) / 1000)) : 0;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-2 animate-fade-up">
      <div className={cn("rounded-2xl border bg-elevated shadow-soft", prep ? "border-warn/40" : "border-line")}>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex w-full items-center gap-2 px-4 pt-3 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle"
          aria-expanded={!collapsed}
        >
          <NotebookPen className="size-3.5" />
          {t("cueTitle")}
          <ChevronDown className={cn("ml-auto size-4 transition-transform", collapsed && "-rotate-90")} />
        </button>
        <div className="flex items-start gap-4 px-4 pb-4 pt-2">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold leading-6">{card.title}</p>
            {!collapsed && (
              <div className="mt-2 text-sm leading-6 text-fg-muted">
                <p className="text-fg">{t("youShouldSay")}</p>
                <ul className="list-disc pl-5">
                  {card.prompts.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
                <p>{card.explain}</p>
              </div>
            )}
          </div>
          {prep && (
            <div className="flex flex-col items-center gap-2">
              <Ring progress={prepLeft / prep.total} label={formatClock(prepLeft)} tone="warn" />
              <span className="text-[11px] font-medium text-warn">{t("prepTime")}</span>
            </div>
          )}
          {!prep && talk && (
            <div className="flex flex-col items-center gap-2">
              <Ring progress={talkElapsed / talk.total} label={formatClock(talkElapsed)} tone="accent" />
              <span className="text-[11px] font-medium text-fg-muted">{t("speakingTime")}</span>
            </div>
          )}
        </div>
        {prep && (
          <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5">
            <span className="text-xs text-fg-muted">{t("prepHint")}</span>
            <button
              type="button"
              onClick={onReady}
              className="shrink-0 rounded-full bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-fg"
            >
              {t("imReady")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

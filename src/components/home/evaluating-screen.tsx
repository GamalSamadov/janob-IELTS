"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { DictKey } from "@/lib/i18n-dict";
import { cn } from "@/lib/utils";
import { useNow } from "../exam/hooks";
import { Spinner } from "../ui/primitives";

const STEPS: { key: DictKey; at: number }[] = [
  { key: "evalStep1", at: 0 },
  { key: "evalStep2", at: 7 },
  { key: "evalStep3", at: 14 },
  { key: "evalStep4", at: 21 },
  { key: "evalStep5", at: 28 },
];

export function EvaluatingScreen() {
  const { t } = useI18n();
  const [startedAt] = useState(() => Date.now());
  const elapsed = (useNow(500) - startedAt) / 1000;
  const current = STEPS.reduce((index, step, i) => (elapsed >= step.at ? i : index), 0);

  return (
    <div className="flex h-full items-center justify-center px-4">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="relative mx-auto mb-8 grid size-20 place-items-center">
          <span className="absolute inset-0 rounded-full bg-accent/20 animate-ripple" />
          <span className="absolute inset-0 rounded-full bg-accent/15 animate-ripple [animation-delay:0.9s]" />
          <span className="relative size-12 rounded-full bg-accent shadow-soft animate-breathe" />
        </div>
        <h1 className="text-center font-serif text-3xl tracking-tight">{t("evaluating")}</h1>
        <p className="mt-2 text-center text-sm text-fg-muted">{t("evaluatingSub")}</p>
        <ol className="mt-8 space-y-3">
          {STEPS.map((step, i) => {
            const done = i < current;
            const active = i === current;
            return (
              <li key={step.key} className={cn("flex items-center gap-3 text-sm transition-opacity", i > current && "opacity-35")}>
                <span
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full border",
                    done ? "border-accent bg-accent text-accent-fg" : "border-line-strong",
                  )}
                >
                  {done ? <Check className="size-3.5" strokeWidth={3} /> : active ? <Spinner className="size-3.5" /> : null}
                </span>
                <span className={cn(active && "font-medium")}>{t(step.key)}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

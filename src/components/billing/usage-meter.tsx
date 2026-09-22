"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { formatTokens, useBilling, usedShare } from "@/lib/billing/client";
import type { PlanId } from "@/lib/billing/plans";
import { useI18n } from "@/lib/i18n";
import type { DictKey } from "@/lib/i18n-dict";
import { cn, formatDay } from "@/lib/utils";
import { useExamGuard } from "../exam-guard";

export const PLAN_LABEL: Record<PlanId, DictKey> = {
  free: "planFree",
  starter: "planStarter",
  pro: "planPro",
  max: "planMax",
};

function barColor(share: number): string {
  if (share >= 1) return "bg-danger";
  if (share >= 0.85) return "bg-warn";
  return "bg-accent";
}

/** Token allowance at the bottom of the sidebar, in the spirit of claude.ai's usage indicator. */
export function UsageMeter({ compact = false }: { compact?: boolean }) {
  const { t, lang } = useI18n();
  const { billing } = useBilling();
  const guard = useExamGuard();

  // Leaving for the plans page mid-test would throw the test away without asking.
  const leave = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!guard.confirmLeave()) return event.preventDefault();
    guard.setActive(false);
  };

  if (!billing) {
    return compact ? null : <div className="mx-2 mb-1 h-[52px] animate-pulse rounded-lg bg-muted/60" />;
  }

  const share = usedShare(billing);
  const percent = Math.min(100, Math.round(share * 100));
  const planName = t(PLAN_LABEL[billing.plan]);
  const note = billing.renewsAt
    ? t("usageResets", { date: formatDay(Date.parse(billing.renewsAt), lang) })
    : t("usageNoReset");
  const title = `${planName} · ${t("usageOf", { used: formatTokens(billing.used), limit: formatTokens(billing.limit) })}`;

  if (compact) {
    const circumference = 2 * Math.PI * 9;
    return (
      <Link
        href="/pricing"
        onClick={leave}
        aria-label={title}
        title={title}
        className="inline-flex size-9 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-hover hover:text-fg"
      >
        <svg viewBox="0 0 22 22" className="size-[22px] -rotate-90" aria-hidden>
          <circle cx="11" cy="11" r="9" fill="none" strokeWidth="2.5" className="stroke-muted" />
          <circle
            cx="11"
            cy="11"
            r="9"
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={`${share * circumference} ${circumference}`}
            className={cn(share >= 1 ? "stroke-danger" : share >= 0.85 ? "stroke-warn" : "stroke-accent")}
          />
        </svg>
      </Link>
    );
  }

  return (
    <Link
      href="/pricing"
      onClick={leave}
      title={title}
      className="block rounded-lg px-2.5 py-2 transition-colors hover:bg-hover"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[13px] font-medium">{planName}</span>
        <span className="shrink-0 text-[11px] tabular-nums text-fg-subtle">{t("usageUsed", { percent })}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-[width] duration-500", barColor(share))} style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-1 truncate text-[11px] text-fg-subtle">
        {billing.remaining > 0 ? `${t("usageLeft", { amount: formatTokens(billing.remaining) })} · ${note}` : note}
      </p>
    </Link>
  );
}

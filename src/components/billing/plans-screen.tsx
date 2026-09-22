"use client";

import { Check, CircleAlert, ExternalLink, Sparkles } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { formatTokens, refreshBilling, useBilling, usedShare } from "@/lib/billing/client";
import { approxTests, getPlan, isPlanId, PLANS, TOKENS_PER_TEST, type Plan, type PlanId } from "@/lib/billing/plans";
import { useI18n } from "@/lib/i18n";
import type { DictKey } from "@/lib/i18n-dict";
import { cn, formatDay } from "@/lib/utils";
import { Spinner } from "../ui/primitives";
import { PLAN_LABEL } from "./usage-meter";

/** How long to keep asking for the subscription after checkout, while the webhook lands. */
const ACTIVATION_ATTEMPTS = 12;
const ACTIVATION_DELAY_MS = 2000;

function Banner({ tone, children }: { tone: "ok" | "warn"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "mb-6 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-[13.5px] leading-5 animate-fade-up",
        tone === "ok" ? "border-accent/40 bg-accent-soft text-fg" : "border-warn/40 bg-warn-soft text-fg",
      )}
    >
      {tone === "ok" ? (
        <Sparkles className="mt-0.5 size-4 shrink-0 text-accent" />
      ) : (
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
      )}
      <span>{children}</span>
    </div>
  );
}

export function PlansScreen() {
  const { t, lang } = useI18n();
  const { billing } = useBilling();
  const params = useSearchParams();
  const checkout = params.get("checkout");
  const boughtPlan = isPlanId(params.get("plan")) ? (params.get("plan") as PlanId) : null;
  const [busy, setBusy] = useState<PlanId | "portal" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activating, setActivating] = useState(checkout === "success");

  // Coming back from Stripe, the subscription only becomes visible once the webhook has been
  // processed, so poll until the new plan shows up rather than claiming nothing happened.
  useEffect(() => {
    if (checkout !== "success") return;
    let cancelled = false;
    void (async () => {
      for (let attempt = 0; attempt < ACTIVATION_ATTEMPTS && !cancelled; attempt++) {
        const snapshot = await refreshBilling();
        if (cancelled) return;
        if (snapshot && (!boughtPlan || snapshot.plan === boughtPlan)) break;
        await new Promise((resolve) => setTimeout(resolve, ACTIVATION_DELAY_MS));
      }
      if (!cancelled) setActivating(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [checkout, boughtPlan]);

  const post = useCallback(
    async (path: string, body?: unknown) => {
      setError(null);
      try {
        const response = await fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body ?? {}),
        });
        const data = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
        if (!response.ok || !data.url) throw new Error(data.error ?? "billing_unavailable");
        window.location.href = data.url;
      } catch (cause) {
        const code = cause instanceof Error ? cause.message : "billing_unavailable";
        const key = `err_${code}` as DictKey;
        setError(t(key) === key ? t("err_billing_unavailable") : t(key));
        setBusy(null);
      }
    },
    [t],
  );

  const current = billing ? getPlan(billing.plan) : null;
  const renewsAt = billing?.renewsAt ? Date.parse(billing.renewsAt) : null;

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
        <header className="mb-8 animate-fade-up">
          <h1 className="font-serif text-[34px] leading-[1.15] tracking-tight sm:text-[40px]">{t("pricingTitle")}</h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-6 text-fg-muted text-pretty">
            {t("pricingSub", { tokens: formatTokens(TOKENS_PER_TEST.full) })}
          </p>
        </header>

        {checkout === "success" && (
          <Banner tone="ok">{activating ? t("checkoutPending") : t("checkoutSuccess")}</Banner>
        )}
        {checkout === "cancelled" && <Banner tone="warn">{t("checkoutCancelled")}</Banner>}
        {billing?.status === "past_due" && <Banner tone="warn">{t("pastDueNotice")}</Banner>}
        {billing?.cancelAtPeriodEnd && renewsAt && (
          <Banner tone="warn">{t("cancelNotice", { date: formatDay(renewsAt, lang) })}</Banner>
        )}
        {billing && !billing.checkoutEnabled && <Banner tone="warn">{t("billingDisabled")}</Banner>}
        {error && <Banner tone="warn">{error}</Banner>}

        {billing && current && (
          <section className="mb-8 rounded-2xl border border-line bg-elevated p-5 shadow-soft animate-fade-up">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="text-sm font-medium">
                {t("currentPlan")}: <span className="font-semibold">{t(PLAN_LABEL[current.id])}</span>
              </h2>
              <span className="text-[13px] tabular-nums text-fg-muted">
                {t("usageOf", { used: formatTokens(billing.used), limit: formatTokens(billing.limit) })}
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-500",
                  usedShare(billing) >= 1 ? "bg-danger" : usedShare(billing) >= 0.85 ? "bg-warn" : "bg-accent",
                )}
                style={{ width: `${Math.min(100, Math.round(usedShare(billing) * 100))}%` }}
              />
            </div>
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13px] text-fg-subtle">
                {renewsAt ? t("usageResets", { date: formatDay(renewsAt, lang) }) : t("usageNoReset")}
              </p>
              {billing.manageable && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => {
                    setBusy("portal");
                    void post("/api/billing/portal");
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line px-3.5 py-1.5 text-[13px] font-medium transition-colors hover:border-line-strong hover:bg-hover disabled:opacity-60"
                >
                  {busy === "portal" ? <Spinner className="size-3.5" /> : <ExternalLink className="size-3.5" />}
                  {t("managePlan")}
                </button>
              )}
            </div>
          </section>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((plan, index) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              current={billing?.plan === plan.id}
              busy={busy === plan.id}
              disabled={busy !== null || !billing?.checkoutEnabled}
              delay={index * 60}
              onChoose={() => {
                setBusy(plan.id);
                void post("/api/billing/checkout", { plan: plan.id });
              }}
            />
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-fg-subtle">
          {t("planTestsLine", { full: approxTests(getPlan("starter")), quick: approxTests(getPlan("starter"), "quick") })}
          {" — "}
          {t("freePlanNote")}
        </p>
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  current,
  busy,
  disabled,
  delay,
  onChoose,
}: {
  plan: Plan;
  current: boolean;
  busy: boolean;
  disabled: boolean;
  delay: number;
  onChoose: () => void;
}) {
  const { t } = useI18n();
  const name = t(PLAN_LABEL[plan.id]);
  const free = plan.priceUsd === 0;

  return (
    <section
      className={cn(
        "flex flex-col rounded-2xl border p-5 animate-fade-up",
        plan.featured ? "border-fg bg-elevated shadow-soft" : "border-line bg-elevated/60",
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold">{name}</h3>
        {current && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-fg-muted">{t("currentPlan")}</span>
        )}
      </div>
      <p className="mt-3 flex items-baseline gap-1">
        <span className="text-[28px] font-semibold tracking-tight tabular-nums">${plan.priceUsd}</span>
        {!free && <span className="text-[13px] text-fg-subtle">{t("perMonth")}</span>}
      </p>
      <p className="mt-2 text-[13px] text-fg-muted">
        {t(free ? "planTokensOnce" : "planTokensLine", { amount: formatTokens(plan.tokens) })}
      </p>

      <ul className="mt-4 space-y-2 text-[13px] leading-5 text-fg-muted">
        {(
          [
            t("planTestsLine", { full: approxTests(plan), quick: approxTests(plan, "quick") }),
            t("planFeatureFeedback"),
            t("planFeatureVoices"),
            t("planFeatureAnswers"),
          ] as const
        ).map((feature) => (
          <li key={feature} className="flex gap-2">
            <Check className="mt-0.5 size-3.5 shrink-0 text-accent" strokeWidth={3} />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-5 flex-1" />
      {free ? (
        <p className="text-[12px] text-fg-subtle">{t("freePlanNote")}</p>
      ) : (
        <button
          type="button"
          disabled={disabled || current}
          onClick={onChoose}
          className={cn(
            "inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-[13.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            plan.featured ? "bg-primary text-primary-fg" : "border border-line hover:border-line-strong hover:bg-hover",
          )}
        >
          {busy && <Spinner className="size-3.5" />}
          {current ? t("currentPlan") : t("choosePlan", { plan: name })}
        </button>
      )}
    </section>
  );
}

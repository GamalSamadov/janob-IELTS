"use client";

import { Check, CircleAlert, ExternalLink, Sparkles } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { formatTokens, syncBilling, useBilling, usedShare } from "@/lib/billing/client";
import { approxTests, getPlan, isPlanId, PLANS, TOKENS_PER_TEST, type Plan, type PlanId } from "@/lib/billing/plans";
import { useI18n } from "@/lib/i18n";
import type { DictKey } from "@/lib/i18n-dict";
import { cn, formatDay } from "@/lib/utils";
import { Spinner } from "../ui/primitives";
import { PLAN_LABEL } from "./usage-meter";

/**
 * How long to keep asking Stripe for the new subscription after checkout. Stripe knows about it
 * the moment the payment goes through, so the first attempt almost always succeeds; the retries
 * are only there for a slow round trip.
 */
const ACTIVATION_ATTEMPTS = 5;
const ACTIVATION_DELAY_MS = 2000;

/** Every plan buys the same product — only the allowance differs — so this is said once. */
const SHARED_FEATURES: DictKey[] = ["planFeatureFeedback", "planFeatureVoices", "planFeatureAnswers"];

function meterColor(share: number): string {
  if (share >= 1) return "bg-danger";
  if (share >= 0.85) return "bg-warn";
  return "bg-accent";
}

function Banner({ tone, children }: { tone: "ok" | "warn"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "mb-4 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-[13.5px] leading-5 animate-fade-up",
        tone === "ok" ? "border-accent/40 bg-accent-soft text-fg" : "border-warn/40 bg-warn-soft text-fg",
      )}
    >
      {tone === "ok" ? (
        <Sparkles className="mt-0.5 size-4 shrink-0 text-accent" />
      ) : (
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
      )}
      <span className="min-w-0">{children}</span>
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
  const [activation, setActivation] = useState<"idle" | "pending" | "done" | "failed">(
    checkout === "success" ? "pending" : "idle",
  );

  // Coming back from Stripe, read the subscription from Stripe itself instead of waiting for
  // its webhook: the payment has already happened, and the plan should be there by the time the
  // page settles. If it never shows up, say so rather than congratulating the customer.
  useEffect(() => {
    if (checkout !== "success") return;
    let cancelled = false;
    void (async () => {
      for (let attempt = 0; attempt < ACTIVATION_ATTEMPTS && !cancelled; attempt++) {
        const snapshot = await syncBilling();
        if (cancelled) return;
        if (snapshot && (!boughtPlan || snapshot.plan === boughtPlan)) {
          setActivation("done");
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, ACTIVATION_DELAY_MS));
      }
      if (!cancelled) setActivation("failed");
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
  const share = billing ? usedShare(billing) : 0;

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-6 animate-fade-up">
          <h1 className="font-serif text-[30px] leading-[1.15] tracking-tight sm:text-[38px]">{t("pricingTitle")}</h1>
          <p className="mt-2.5 max-w-2xl text-[14px] leading-6 text-fg-muted text-pretty sm:text-[15px]">
            {t("pricingSub", { tokens: formatTokens(TOKENS_PER_TEST.full) })}
          </p>
        </header>

        {checkout === "success" &&
          (activation === "failed" ? (
            <Banner tone="warn">{t("checkoutStuck")}</Banner>
          ) : (
            <Banner tone="ok">{activation === "pending" ? t("checkoutPending") : t("checkoutSuccess")}</Banner>
          ))}
        {checkout === "cancelled" && <Banner tone="warn">{t("checkoutCancelled")}</Banner>}
        {billing?.status === "past_due" && <Banner tone="warn">{t("pastDueNotice")}</Banner>}
        {billing?.cancelAtPeriodEnd && renewsAt && (
          <Banner tone="warn">{t("cancelNotice", { date: formatDay(renewsAt, lang) })}</Banner>
        )}
        {billing && !billing.checkoutEnabled && <Banner tone="warn">{t("billingDisabled")}</Banner>}
        {error && <Banner tone="warn">{error}</Banner>}

        {billing && current && (
          <section className="mb-7 rounded-2xl border border-line bg-elevated p-4 shadow-soft animate-fade-up sm:p-5">
            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">{t("currentPlan")}</p>
                <p className="mt-1 truncate text-[22px] font-semibold leading-none tracking-tight">
                  {t(PLAN_LABEL[current.id])}
                </p>
              </div>
              <p className="shrink-0 text-right text-[22px] font-semibold leading-none tracking-tight tabular-nums">
                {formatTokens(billing.remaining)}
                <span className="ml-1.5 text-[12.5px] font-normal text-fg-subtle">{t("remainingShort")}</span>
              </p>
            </div>

            <div className="mt-3.5 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full transition-[width] duration-500", meterColor(share))}
                style={{ width: `${Math.max(share > 0 ? 2 : 0, Math.min(100, Math.round(share * 100)))}%` }}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
              <p className="text-[12.5px] text-fg-subtle">
                {t("usageOf", { used: formatTokens(billing.used), limit: formatTokens(billing.limit) })}
                {" · "}
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
                  className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full border border-line px-4 text-[13.5px] font-medium transition-colors hover:border-line-strong hover:bg-hover disabled:opacity-60 sm:w-auto"
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
              delay={index * 50}
              onChoose={() => {
                setBusy(plan.id);
                void post("/api/billing/checkout", { plan: plan.id });
              }}
            />
          ))}
        </div>

        {/* Said once instead of four times: the plans differ only in how many tests they buy. */}
        <section className="mt-5 rounded-2xl border border-line bg-elevated/50 p-4 animate-fade-up sm:p-5">
          <h2 className="text-[13px] font-medium text-fg-muted">{t("planIncludes")}</h2>
          <ul className="mt-3 grid gap-2.5 text-[13.5px] leading-5 sm:grid-cols-3">
            {SHARED_FEATURES.map((key) => (
              <li key={key} className="flex gap-2">
                <Check className="mt-0.5 size-3.5 shrink-0 text-accent" strokeWidth={3} />
                <span>{t(key)}</span>
              </li>
            ))}
          </ul>
        </section>
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
  const tests = approxTests(plan);

  return (
    <section
      className={cn(
        "flex flex-col rounded-2xl border p-4 animate-fade-up",
        current
          ? "border-fg bg-elevated shadow-soft"
          : plan.featured
            ? "border-line-strong bg-elevated"
            : "border-line bg-elevated/60",
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold">{name}</h3>
        {current && (
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-fg-muted">
            {t("currentPlan")}
          </span>
        )}
      </div>

      <p className="mt-2 flex items-baseline gap-1">
        <span className="text-[26px] font-semibold leading-none tracking-tight tabular-nums">${plan.priceUsd}</span>
        {!free && <span className="text-[13px] text-fg-subtle">{t("perMonth")}</span>}
      </p>

      <p className="mt-2.5 text-[13px] text-fg-muted">
        {t(free ? "planTokensOnce" : "planTokensLine", { amount: formatTokens(plan.tokens) })}
      </p>
      <p className="mt-0.5 text-[13px] font-medium">
        {t(tests === 1 ? "planTestsShortOnce" : "planTestsShort", { count: tests })}
      </p>

      <div className="mt-4 flex-1" />
      {free ? (
        <p className="text-[12px] leading-4 text-fg-subtle">{t("freePlanNote")}</p>
      ) : (
        <button
          type="button"
          disabled={disabled || current}
          onClick={onChoose}
          className={cn(
            "inline-flex h-11 items-center justify-center gap-2 rounded-full px-4 text-[13.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            plan.featured && !current
              ? "bg-primary text-primary-fg hover:opacity-90"
              : "border border-line hover:border-line-strong hover:bg-hover",
          )}
        >
          {busy && <Spinner className="size-3.5" />}
          {current ? t("currentPlan") : t("choose")}
        </button>
      )}
    </section>
  );
}

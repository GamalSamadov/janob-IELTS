/**
 * The subscription catalogue. Imported by the browser (pricing page, usage meter) and by the
 * server, so it must stay free of secrets: the Stripe price ids live in environment variables
 * and are resolved in `src/lib/server/billing/stripe.ts`.
 */

import type { ExamMode } from "@/lib/exam/types";

export type PlanId = "free" | "starter" | "pro" | "max";

/**
 * Tokens one finished test costs on average: the live conversation with the examiner plus the
 * transcription and the assessment that follow it. Plan sizes, the "≈ N tests" shown on the
 * pricing page and the amount held when a test starts are all derived from these two numbers,
 * so this is the one place to re-tune once real usage has been observed.
 */
export const TOKENS_PER_TEST: Record<ExamMode, number> = { full: 120_000, quick: 60_000 };

export interface Plan {
  id: PlanId;
  /** Monthly price in US dollars; 0 on the free tier. */
  priceUsd: number;
  /** Tokens granted for one billing period. */
  tokens: number;
  /** Larger tier shown as the recommended one. */
  featured?: boolean;
}

/** The free tier is a one-off trial: its tokens are granted once and never refill. */
export const PLANS: readonly Plan[] = [
  { id: "free", priceUsd: 0, tokens: 150_000 },
  { id: "starter", priceUsd: 20, tokens: 2_400_000 },
  { id: "pro", priceUsd: 60, tokens: 7_800_000, featured: true },
  { id: "max", priceUsd: 100, tokens: 13_800_000 },
] as const;

export const PAID_PLANS = PLANS.filter((plan) => plan.priceUsd > 0);

export const FREE_PLAN = PLANS[0];

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && PLANS.some((plan) => plan.id === value);
}

export function getPlan(id: unknown): Plan {
  return PLANS.find((plan) => plan.id === id) ?? FREE_PLAN;
}

/** How many tests of one format a plan's allowance covers, for the pricing table. */
export function approxTests(plan: Plan, mode: ExamMode = "full"): number {
  return Math.floor(plan.tokens / TOKENS_PER_TEST[mode]);
}

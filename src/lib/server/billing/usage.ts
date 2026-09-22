import { FREE_PLAN, getPlan, TOKENS_PER_TEST } from "@/lib/billing/plans";
import type { BillingSnapshot, SubscriptionStatus } from "@/lib/billing/types";
import { MODE_RULES } from "@/lib/exam/plan";
import type { ExamMode } from "@/lib/exam/types";
import { committed, limitOf, type BillingRecord, type Hold, type SubscriptionState } from "./record";

/**
 * Token metering. Everything the app spends on a user — the live examiner, the transcription
 * and the assessment — is counted in Gemini tokens and charged against the plan's allowance.
 *
 * Server-side calls are charged exactly, from the usage the API reports. The live conversation
 * is different: it runs straight between the browser and Gemini, so only the browser sees its
 * usage. That is handled by reserving the estimated cost of a test before the session token is
 * issued, and settling the reservation against the reported usage afterwards — clamped, on the
 * server, between a floor derived from how long the session actually lasted and a ceiling
 * derived from the format's hard time limit. A browser that lies, or never reports back, can
 * therefore never spend less than the floor or more than the ceiling.
 */

/**
 * Tokens a live session costs per wall-clock second. Live audio is billed by duration, so this
 * one number converts a session's length into tokens. Override it with
 * `BILLING_LIVE_TOKENS_PER_SECOND` once real sessions have been measured.
 */
export const LIVE_TOKENS_PER_SECOND = Number(process.env.BILLING_LIVE_TOKENS_PER_SECOND) || 100;

/** The share of the time-based estimate a session is charged even if the browser reports less. */
const MIN_REPORTED_RATIO = 0.5;

/** Grace on top of a format's hard stop before a live session is considered abandoned. */
const HOLD_GRACE_MS = 5 * 60_000;

/** Both shapes the Gemini SDK reports usage in: `usageMetadata` and `interactions` `usage`. */
interface GeminiUsage {
  totalTokenCount?: number;
  promptTokenCount?: number;
  responseTokenCount?: number;
  thoughtsTokenCount?: number;
  toolUsePromptTokenCount?: number;
  total_tokens?: number;
  total_input_tokens?: number;
  total_output_tokens?: number;
  total_thought_tokens?: number;
  total_tool_use_prompt_tokens?: number;
}

const int = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0);

/** Total tokens in a Gemini usage report, whichever shape it came in. */
export function tokensFrom(usage: unknown): number {
  if (!usage || typeof usage !== "object") return 0;
  const u = usage as GeminiUsage;
  const total = int(u.totalTokenCount) || int(u.total_tokens);
  if (total) return Math.round(total);
  const parts =
    int(u.promptTokenCount) +
    int(u.responseTokenCount) +
    int(u.thoughtsTokenCount) +
    int(u.toolUsePromptTokenCount) +
    int(u.total_input_tokens) +
    int(u.total_output_tokens) +
    int(u.total_thought_tokens) +
    int(u.total_tool_use_prompt_tokens);
  return Math.round(parts);
}

/** What one test of this format is expected to cost, held while it runs. */
export function reservationFor(mode: ExamMode): number {
  return TOKENS_PER_TEST[mode];
}

/** The most a live session of this format can be charged: its hard stop plus a short grace. */
function liveCeiling(mode: ExamMode): number {
  return Math.round((MODE_RULES[mode].maxMinutes * 60 + 120) * LIVE_TOKENS_PER_SECOND);
}

function holdLifetime(mode: ExamMode): number {
  return MODE_RULES[mode].maxMinutes * 60_000 + HOLD_GRACE_MS;
}

/** Charge for a live session: the browser's figure, kept inside server-verifiable bounds. */
export function settlementFor(hold: Hold, reported: number | null, now: number): number {
  const elapsedSec = Math.max(0, (now - hold.startedAt) / 1000);
  const estimate = elapsedSec * LIVE_TOKENS_PER_SECOND;
  const ceiling = liveCeiling(hold.mode);
  if (reported === null) return Math.round(Math.min(estimate, ceiling));
  const floor = estimate * MIN_REPORTED_RATIO;
  return Math.round(Math.min(Math.max(reported, floor), ceiling));
}

/** A test that never reported back is charged what it reserved. */
export function settleExpiredHolds(record: BillingRecord, now = Date.now()): BillingRecord {
  const expired = record.holds.filter((hold) => hold.expiresAt <= now);
  if (expired.length === 0) return record;
  return {
    ...record,
    used: record.used + expired.reduce((sum, hold) => sum + hold.tokens, 0),
    holds: record.holds.filter((hold) => hold.expiresAt > now),
  };
}

export type ReserveResult =
  | { ok: true; record: BillingRecord; reused: boolean }
  | { ok: false; record: BillingRecord };

/**
 * Holds the cost of a test before its session token is issued. Reconnects ask for a new token
 * with the same exam id, so an existing hold is reused instead of charging the test twice.
 */
export function reserve(record: BillingRecord, examId: string, mode: ExamMode, now = Date.now()): ReserveResult {
  const settled = settleExpiredHolds(record, now);
  const existing = settled.holds.find((hold) => hold.id === examId);
  if (existing) return { ok: true, record: settled, reused: true };

  const tokens = reservationFor(mode);
  if (limitOf(settled) - committed(settled) < tokens) return { ok: false, record: settled };

  const hold: Hold = { id: examId, mode, tokens, startedAt: now, expiresAt: now + holdLifetime(mode) };
  return { ok: true, record: { ...settled, holds: [...settled.holds, hold] }, reused: false };
}

/** Replaces a test's reservation with what it really cost. Returns `null` if it was settled already. */
export function settle(record: BillingRecord, examId: string, reported: number | null, now = Date.now()): BillingRecord | null {
  const hold = record.holds.find((h) => h.id === examId);
  if (!hold) return null;
  return {
    ...record,
    used: record.used + settlementFor(hold, reported, now),
    holds: record.holds.filter((h) => h.id !== examId),
  };
}

/** Charges tokens a server-side call really spent. */
export function charge(record: BillingRecord, tokens: number, now = Date.now()): BillingRecord | null {
  if (tokens <= 0) return null;
  const settled = settleExpiredHolds(record, now);
  return { ...settled, used: settled.used + Math.round(tokens) };
}

/** Statuses that keep a paid allowance. `past_due` keeps working while Stripe retries payment. */
const ENTITLED: SubscriptionStatus[] = ["active", "trialing", "past_due"];

export function isEntitled(status: SubscriptionStatus): boolean {
  return ENTITLED.includes(status);
}

export function snapshot(record: BillingRecord, options: { checkoutEnabled: boolean }): BillingSnapshot {
  const limit = limitOf(record);
  const used = Math.min(committed(record), limit);
  const remaining = Math.max(0, limit - committed(record));
  const modes: ExamMode[] = ["full", "quick"];
  return {
    plan: getPlan(record.plan).id,
    status: record.status,
    limit,
    used,
    remaining,
    renewsAt: record.periodEnd ? new Date(record.periodEnd).toISOString() : null,
    cancelAtPeriodEnd: record.cancelAtPeriodEnd,
    canStart: Object.fromEntries(modes.map((mode) => [mode, remaining >= reservationFor(mode)])) as Record<ExamMode, boolean>,
    checkoutEnabled: options.checkoutEnabled,
    manageable: Boolean(record.customerId),
  };
}

/** Folds a Stripe subscription into the stored record. */
export function applySubscription(record: BillingRecord, state: SubscriptionState, now = Date.now()): BillingRecord {
  const entitled = isEntitled(state.status);
  // A new paid period starts with a full allowance. Falling back to the free tier does not
  // reset anything, so a cancelled subscription cannot be used to mint another free trial.
  const renewed = entitled && state.periodStart > record.periodStart;
  return {
    ...record,
    plan: entitled ? state.plan : FREE_PLAN.id,
    status: state.status,
    customerId: state.customerId || record.customerId,
    subscriptionId: state.subscriptionId,
    periodStart: entitled ? state.periodStart : record.periodStart,
    periodEnd: entitled ? state.periodEnd : null,
    cancelAtPeriodEnd: entitled && state.cancelAtPeriodEnd,
    used: renewed ? 0 : record.used,
    syncedAt: now,
  };
}

/** The subscription is gone for good: back to the free tier, keeping the usage already spent. */
export function clearSubscription(record: BillingRecord, now = Date.now()): BillingRecord {
  return {
    ...record,
    plan: FREE_PLAN.id,
    status: "canceled",
    subscriptionId: null,
    periodEnd: null,
    cancelAtPeriodEnd: false,
    syncedAt: now,
  };
}

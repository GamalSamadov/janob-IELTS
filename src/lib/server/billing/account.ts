import "server-only";
import type { BillingSnapshot } from "@/lib/billing/types";
import type { ExamMode } from "@/lib/exam/types";
import type { BillingRecord, SubscriptionState } from "./record";
import { readRecord, updateRecord } from "./store";
import { fetchSubscription, isCheckoutEnabled, latestSubscription, subscriptionState } from "./stripe";
import {
  applySubscription,
  charge,
  clearSubscription,
  reserve,
  settle,
  settleExpiredHolds,
  snapshot,
} from "./usage";

/**
 * What the rest of the app uses for billing. It keeps the stored mirror of the Stripe
 * subscription honest — refreshing it from Stripe when a billing period should have rolled over
 * but no webhook arrived — and applies every change to the usage counters in one place.
 */

/** Do not ask Stripe about the same account more often than this while the mirror looks stale. */
const REFRESH_INTERVAL_MS = 60_000;

function needsRefresh(record: BillingRecord, now: number): boolean {
  if (!record.subscriptionId) return false;
  if (now - record.syncedAt < REFRESH_INTERVAL_MS) return false;
  // The period should have rolled over by now, or a payment is being retried.
  return (record.periodEnd !== null && now >= record.periodEnd) || record.status === "past_due";
}

/**
 * The account's billing record, with expired reservations settled and — when the mirror looks
 * out of date — the subscription re-read from Stripe. Webhooks normally keep it current; this
 * is what makes a missed or delayed webhook heal itself.
 */
export async function loadAccount(userId: string): Promise<BillingRecord> {
  const record = await readRecord(userId);
  const now = Date.now();

  if (!needsRefresh(record, now)) {
    // Settle in the background only when there is something to settle.
    if (record.holds.some((hold) => hold.expiresAt <= now)) {
      return updateRecord(userId, (current) => settleExpiredHolds(current, now));
    }
    return record;
  }

  let state: SubscriptionState | null = null;
  try {
    const subscription = await fetchSubscription(record.subscriptionId!);
    state = subscription ? subscriptionState(subscription) : null;
  } catch (error) {
    console.error("[billing] could not refresh the subscription:", error);
    return settleExpiredHolds(record, now);
  }

  return updateRecord(userId, (current) => {
    const settled = settleExpiredHolds(current, now);
    return state ? applySubscription(settled, state, now) : clearSubscription(settled, now);
  });
}

export function toSnapshot(record: BillingRecord): BillingSnapshot {
  return snapshot(record, { checkoutEnabled: isCheckoutEnabled() });
}

export async function getSnapshot(userId: string): Promise<BillingSnapshot> {
  return toSnapshot(await loadAccount(userId));
}

export type ReserveOutcome =
  /** `reused` means a hold for this exam already existed, i.e. this is a reconnect. */
  | { ok: true; reused: boolean; snapshot: BillingSnapshot }
  | { ok: false; reused: false; snapshot: BillingSnapshot };

/**
 * Holds the cost of a test before its live session starts. Reconnects reuse the hold that the
 * first call to `/api/live/token` created, so one test is only ever charged once.
 */
export async function reserveExam(userId: string, examId: string, mode: ExamMode): Promise<ReserveOutcome> {
  await loadAccount(userId);
  let allowed = false;
  let reused = false;
  const record = await updateRecord(userId, (current) => {
    const result = reserve(current, examId, mode);
    allowed = result.ok;
    reused = result.ok && result.reused;
    // A rejected reserve may still have settled expired holds, which is worth persisting.
    if (!result.ok) return result.record === current ? null : result.record;
    return result.record;
  });
  const snapshot = toSnapshot(record);
  return allowed ? { ok: true, reused, snapshot } : { ok: false, reused: false, snapshot };
}

/** Settles a finished live session against the usage the browser reported. */
export async function settleExam(userId: string, examId: string, reported: number | null): Promise<void> {
  await updateRecord(userId, (current) => settle(current, examId, reported));
}

/** Charges what a server-side Gemini call really spent. Never blocks: the work is already done. */
export async function chargeUsage(userId: string, tokens: number): Promise<void> {
  if (tokens <= 0) return;
  try {
    await updateRecord(userId, (current) => charge(current, tokens));
  } catch (error) {
    console.error("[billing] could not record usage:", error);
  }
}

/** Remembers the Stripe customer created for this account. */
export async function linkCustomer(userId: string, customerId: string): Promise<void> {
  await updateRecord(userId, (current) => (current.customerId === customerId ? null : { ...current, customerId }));
}

/**
 * Re-reads a customer's newest subscription and stores it. Used by the webhook, where the event
 * may be older than what Stripe now holds, and after a checkout returns.
 */
export async function syncFromStripe(userId: string, customerId: string): Promise<BillingRecord> {
  const subscription = await latestSubscription(customerId);
  const state = subscription ? subscriptionState(subscription) : null;
  const now = Date.now();
  return updateRecord(userId, (current) => {
    const base = { ...settleExpiredHolds(current, now), customerId };
    return state ? applySubscription(base, state, now) : clearSubscription(base, now);
  });
}

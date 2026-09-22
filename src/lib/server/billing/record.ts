import { FREE_PLAN, getPlan, isPlanId, type PlanId } from "@/lib/billing/plans";
import type { SubscriptionStatus } from "@/lib/billing/types";
import type { ExamMode } from "@/lib/exam/types";

/**
 * What the app stores about an account's billing, and how to read it back safely. Pure data
 * and pure functions: where the record is kept lives in `store.ts`, and how it changes lives in
 * `usage.ts`, so the rules can be reasoned about (and exercised) without any infrastructure.
 *
 * Stripe remains the source of truth for the subscription — the fields mirroring it are kept
 * fresh by the webhook. The usage counters are ours alone.
 */

/** Tokens set aside while a test is running, settled against real usage when it ends. */
export interface Hold {
  /** The exam id the browser sent to `/api/live/token`. */
  id: string;
  mode: ExamMode;
  tokens: number;
  startedAt: number;
  /** After this the hold is charged in full: the browser never reported back. */
  expiresAt: number;
}

export interface BillingRecord {
  /** Plan the current allowance comes from; "free" whenever no paid subscription is live. */
  plan: PlanId;
  status: SubscriptionStatus;
  customerId: string | null;
  subscriptionId: string | null;
  /** Start of the allowance window (epoch ms). Usage resets whenever this moves. */
  periodStart: number;
  /** End of the window, or `null` on the free tier, whose tokens never refill. */
  periodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  /** Tokens spent inside the current window, holds excluded. */
  used: number;
  holds: Hold[];
  /** When the Stripe mirror was last read, so a stale-looking record is not re-fetched in a loop. */
  syncedAt: number;
}

export function freshRecord(now = Date.now()): BillingRecord {
  return {
    plan: FREE_PLAN.id,
    status: "none",
    customerId: null,
    subscriptionId: null,
    periodStart: now,
    periodEnd: null,
    cancelAtPeriodEnd: false,
    used: 0,
    holds: [],
    syncedAt: 0,
  };
}

const STATUSES: SubscriptionStatus[] = [
  "none",
  "active",
  "trialing",
  "past_due",
  "canceled",
  "unpaid",
  "incomplete",
  "incomplete_expired",
  "paused",
];

const num = (value: unknown, fallback = 0): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const str = (value: unknown): string | null => (typeof value === "string" && value ? value : null);

function parseHolds(value: unknown): Hold[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const hold = raw as Record<string, unknown>;
    const id = str(hold.id);
    if (!id) return [];
    return [
      {
        id,
        mode: hold.mode === "quick" ? "quick" : "full",
        tokens: Math.max(0, num(hold.tokens)),
        startedAt: num(hold.startedAt, Date.now()),
        expiresAt: num(hold.expiresAt, Date.now()),
      },
    ];
  });
}

/** Clerk metadata is untyped JSON, so every field is validated on the way in. */
export function parseRecord(value: unknown): BillingRecord {
  const base = freshRecord();
  if (!value || typeof value !== "object") return base;
  const raw = value as Record<string, unknown>;
  const status = STATUSES.find((s) => s === raw.status) ?? base.status;
  return {
    plan: isPlanId(raw.plan) ? raw.plan : base.plan,
    status,
    customerId: str(raw.customerId),
    subscriptionId: str(raw.subscriptionId),
    periodStart: num(raw.periodStart, base.periodStart),
    periodEnd: typeof raw.periodEnd === "number" && Number.isFinite(raw.periodEnd) ? raw.periodEnd : null,
    cancelAtPeriodEnd: raw.cancelAtPeriodEnd === true,
    used: Math.max(0, num(raw.used)),
    holds: parseHolds(raw.holds),
    syncedAt: num(raw.syncedAt),
  };
}

/** Tokens the plan grants for the current period. */
export function limitOf(record: BillingRecord): number {
  return getPlan(record.plan).tokens;
}

/** Spent plus reserved: what the meter shows and what gating decisions are made against. */
export function committed(record: BillingRecord): number {
  return record.used + record.holds.reduce((sum, hold) => sum + hold.tokens, 0);
}

export function remainingOf(record: BillingRecord): number {
  return Math.max(0, limitOf(record) - committed(record));
}

/** The parts of a Stripe subscription the app acts on, mapped out of the Stripe object. */
export interface SubscriptionState {
  plan: PlanId;
  status: SubscriptionStatus;
  subscriptionId: string;
  customerId: string;
  /** Epoch ms; the billing period of the subscription's first item. */
  periodStart: number;
  periodEnd: number | null;
  cancelAtPeriodEnd: boolean;
}

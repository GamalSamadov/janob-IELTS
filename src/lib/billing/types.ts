/** Wire types shared by the billing API routes and the browser. */

import type { ExamMode } from "@/lib/exam/types";
import type { PlanId } from "./plans";

/**
 * Stripe's subscription status, mirrored as-is, plus "none" for accounts that never
 * subscribed. `active`, `trialing` and `past_due` keep the paid allowance; anything else
 * falls back to the free tier.
 */
export type SubscriptionStatus =
  | "none"
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired"
  | "paused";

export interface BillingSnapshot {
  plan: PlanId;
  status: SubscriptionStatus;
  /** Tokens granted for the current period. */
  limit: number;
  /** Tokens spent in it, including the amount held by a test that is running right now. */
  used: number;
  /** `limit - used`, never below zero. */
  remaining: number;
  /** When the allowance refills (ISO 8601). `null` on the free tier, which never refills. */
  renewsAt: string | null;
  /** The subscription stays usable until `renewsAt` and is not renewed after that. */
  cancelAtPeriodEnd: boolean;
  /** Formats that still fit in the remaining allowance. */
  canStart: Record<ExamMode, boolean>;
  /** Stripe is configured, so plans can be bought. */
  checkoutEnabled: boolean;
  /** The account has a Stripe customer, so the billing portal can be opened. */
  manageable: boolean;
}

/** POST /api/exam/usage — what the browser reports once a live test is over. */
export interface UsageReport {
  examId: string;
  /** Tokens the Live API reported for the session, or `null` when it reported none. */
  tokens: number | null;
}

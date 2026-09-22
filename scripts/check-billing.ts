/**
 * Checks the token-metering rules that decide what a test costs and when an account is out of
 * allowance. Pure functions only, so no server or Stripe account is needed:
 *
 *   npx tsx scripts/check-billing.ts
 */

import assert from "node:assert/strict";
import { FREE_PLAN, getPlan, TOKENS_PER_TEST, approxTests } from "@/lib/billing/plans";
import { freshRecord, committed, remainingOf, limitOf, type BillingRecord } from "@/lib/server/billing/record";
import {
  LIVE_TOKENS_PER_SECOND,
  applySubscription,
  charge,
  clearSubscription,
  reserve,
  settle,
  settleExpiredHolds,
  settlementFor,
  snapshot,
  tokensFrom,
} from "@/lib/server/billing/usage";

const T0 = 1_700_000_000_000;
let passed = 0;
const check = (name: string, fn: () => void) => {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
};

console.log("plan catalogue");
check("advertised test counts are 1 / 20 / 65 / 115", () => {
  assert.equal(approxTests(getPlan("free")), 1);
  assert.equal(approxTests(getPlan("starter")), 20);
  assert.equal(approxTests(getPlan("pro")), 65);
  assert.equal(approxTests(getPlan("max")), 115);
});

console.log("usage extraction");
check("reads both Gemini usage shapes", () => {
  assert.equal(tokensFrom({ totalTokenCount: 1234 }), 1234);
  assert.equal(tokensFrom({ total_tokens: 99 }), 99);
  assert.equal(tokensFrom({ promptTokenCount: 10, responseTokenCount: 5, thoughtsTokenCount: 2 }), 17);
  assert.equal(tokensFrom(undefined), 0);
  assert.equal(tokensFrom({ totalTokenCount: -5 }), 0);
});

console.log("reservations");
check("a free account gets exactly one full test", () => {
  const free = freshRecord(T0);
  assert.equal(limitOf(free), FREE_PLAN.tokens);
  const first = reserve(free, "exam-1", "full", T0);
  assert.equal(first.ok, true);
  assert.ok(first.ok);
  // Settle it at the reserved amount, as an abandoned test would be.
  const afterFirst = settle(first.record, "exam-1", TOKENS_PER_TEST.full, T0 + 900_000)!;
  const second = reserve(afterFirst, "exam-2", "full", T0 + 900_001);
  assert.equal(second.ok, false, "a second full test must be refused");
  const quick = reserve(afterFirst, "exam-2", "quick", T0 + 900_001);
  assert.equal(quick.ok, false, "and so must a quick one: 30K left, 60K needed");
});

check("a reconnect reuses the hold instead of charging twice", () => {
  const paid: BillingRecord = { ...freshRecord(T0), plan: "starter", status: "active" };
  const first = reserve(paid, "exam-9", "full", T0);
  assert.ok(first.ok && !first.reused);
  const again = reserve(first.record, "exam-9", "full", T0 + 60_000);
  assert.ok(again.ok && again.reused);
  assert.equal(again.record.holds.length, 1);
  assert.equal(committed(again.record), TOKENS_PER_TEST.full);
});

console.log("settlement clamps");
const hold = { id: "e", mode: "full" as const, tokens: TOKENS_PER_TEST.full, startedAt: T0, expiresAt: T0 + 10 };
check("an honest report is charged as reported", () => {
  // 12 minutes of conversation, browser reports 84K tokens.
  assert.equal(settlementFor(hold, 84_000, T0 + 12 * 60_000), 84_000);
});
check("a browser reporting nothing still pays the time floor", () => {
  const charged = settlementFor(hold, 0, T0 + 12 * 60_000);
  assert.equal(charged, Math.round(12 * 60 * LIVE_TOKENS_PER_SECOND * 0.5));
  assert.ok(charged > 0);
});
check("a browser reporting an absurd figure is capped", () => {
  const charged = settlementFor(hold, 99_000_000, T0 + 12 * 60_000);
  assert.equal(charged, Math.round((22 * 60 + 120) * LIVE_TOKENS_PER_SECOND));
});
check("no usage reported at all falls back to the time estimate", () => {
  assert.equal(settlementFor(hold, null, T0 + 600_000), Math.round(600 * LIVE_TOKENS_PER_SECOND));
});
check("a test that failed to connect costs next to nothing", () => {
  assert.ok(settlementFor(hold, 0, T0 + 900) < 100);
});

console.log("abandoned tests");
check("an expired hold is charged in full", () => {
  const started = reserve(freshRecord(T0), "gone", "full", T0);
  assert.ok(started.ok);
  const later = settleExpiredHolds(started.record, T0 + 60 * 60_000);
  assert.equal(later.holds.length, 0);
  assert.equal(later.used, TOKENS_PER_TEST.full);
});

console.log("subscription changes");
const stripeState = {
  plan: "pro" as const,
  status: "active" as const,
  subscriptionId: "sub_1",
  customerId: "cus_1",
  periodStart: T0 + 1000,
  periodEnd: T0 + 30 * 86_400_000,
  cancelAtPeriodEnd: false,
};
check("subscribing grants a fresh allowance", () => {
  const spentFree = { ...freshRecord(T0), used: FREE_PLAN.tokens };
  const subscribed = applySubscription(spentFree, stripeState, T0 + 2000);
  assert.equal(subscribed.plan, "pro");
  assert.equal(subscribed.used, 0);
  assert.equal(remainingOf(subscribed), getPlan("pro").tokens);
});
check("renewal resets usage, a mid-period update does not", () => {
  const used = { ...applySubscription(freshRecord(T0), stripeState, T0), used: 5_000_000 };
  const sameMonth = applySubscription(used, { ...stripeState, cancelAtPeriodEnd: true }, T0);
  assert.equal(sameMonth.used, 5_000_000);
  assert.equal(sameMonth.cancelAtPeriodEnd, true);
  const nextMonth = applySubscription(used, { ...stripeState, periodStart: T0 + 31 * 86_400_000 }, T0);
  assert.equal(nextMonth.used, 0);
});
check("cancelling does not mint a new free trial", () => {
  const used = { ...applySubscription(freshRecord(T0), stripeState, T0), used: 5_000_000 };
  const lapsed = clearSubscription(used, T0);
  assert.equal(lapsed.plan, "free");
  assert.equal(lapsed.used, 5_000_000);
  assert.equal(remainingOf(lapsed), 0);
  assert.equal(reserve(lapsed, "x", "quick", T0).ok, false);
  // An unpaid subscription reported by Stripe behaves the same way.
  const unpaid = applySubscription(used, { ...stripeState, status: "canceled" }, T0);
  assert.equal(unpaid.plan, "free");
  assert.equal(unpaid.used, 5_000_000);
});
check("past_due keeps the plan working while Stripe retries", () => {
  const retrying = applySubscription(freshRecord(T0), { ...stripeState, status: "past_due" }, T0);
  assert.equal(retrying.plan, "pro");
  assert.equal(remainingOf(retrying), getPlan("pro").tokens);
});

console.log("snapshot");
check("reports a usable shape to the browser", () => {
  const record = { ...applySubscription(freshRecord(T0), stripeState, T0), used: 7_700_000 };
  const view = snapshot(record, { checkoutEnabled: true });
  assert.equal(view.plan, "pro");
  assert.equal(view.limit, getPlan("pro").tokens);
  assert.equal(view.remaining, 100_000);
  assert.equal(view.canStart.full, false, "100K left is not enough for a 120K full test");
  assert.equal(view.canStart.quick, true, "but it covers a 60K quick test");
  assert.equal(view.renewsAt, new Date(stripeState.periodEnd).toISOString());
  assert.equal(view.manageable, true);
});
check("charging also settles a reservation that expired meanwhile", () => {
  const started = reserve(freshRecord(T0), "stale", "quick", T0);
  assert.ok(started.ok);
  const charged = charge(started.record, 20_000, T0 + 60 * 60_000)!;
  assert.equal(charged.holds.length, 0);
  assert.equal(charged.used, TOKENS_PER_TEST.quick + 20_000);
});
check("overspending shows an empty meter rather than a negative one", () => {
  const over = charge({ ...freshRecord(T0), used: FREE_PLAN.tokens }, 500_000)!;
  const view = snapshot(over, { checkoutEnabled: false });
  assert.equal(view.remaining, 0);
  assert.equal(view.used, view.limit);
  assert.equal(view.canStart.full, false);
});

console.log(`\n${passed} checks passed`);

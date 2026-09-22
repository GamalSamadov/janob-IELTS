import { NextResponse } from "next/server";
import { loadAccount, syncFromStripe, toSnapshot } from "@/lib/server/billing/account";
import { isSameOrigin, rateLimit, requireUser } from "@/lib/server/guard";

/**
 * POST /api/billing/sync — re-reads the account's subscription straight from Stripe.
 *
 * The webhook is what normally tells us about a new subscription, but it can be late, blocked
 * or misconfigured, and the moment that hurts most is right after a payment. Returning from
 * Checkout the browser calls this, so the plan appears from Stripe's own state instead of
 * depending on a delivery we do not control.
 */
export async function POST(request: Request) {
  const user = await requireUser();
  if ("response" in user) return user.response;
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!rateLimit(`sync:${user.userId}`, 20, 10 * 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  try {
    const record = await loadAccount(user.userId);
    // No Stripe customer means nothing was ever bought: the stored record is already the truth.
    if (!record.customerId) {
      return NextResponse.json(toSnapshot(record), { headers: { "Cache-Control": "no-store" } });
    }
    const synced = await syncFromStripe(user.userId, record.customerId);
    return NextResponse.json(toSnapshot(synced), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[billing/sync]", error);
    return NextResponse.json({ error: "billing_unavailable" }, { status: 503 });
  }
}

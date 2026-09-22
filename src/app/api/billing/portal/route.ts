import { NextResponse } from "next/server";
import { loadAccount } from "@/lib/server/billing/account";
import { createPortalSession } from "@/lib/server/billing/stripe";
import { isSameOrigin, rateLimit, requireUser, siteOrigin } from "@/lib/server/guard";

/** POST /api/billing/portal — opens the Stripe billing portal for the signed-in account. */
export async function POST(request: Request) {
  const user = await requireUser();
  if ("response" in user) return user.response;
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!rateLimit(`portal:${user.userId}`, 10, 10 * 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  try {
    const record = await loadAccount(user.userId);
    if (!record.customerId) return NextResponse.json({ error: "no_subscription" }, { status: 404 });
    const url = await createPortalSession(record.customerId, siteOrigin(request));
    return NextResponse.json({ url }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[billing/portal]", error);
    return NextResponse.json({ error: "billing_unavailable" }, { status: 503 });
  }
}

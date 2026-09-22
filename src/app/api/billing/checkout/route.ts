import { clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isPlanId, type PlanId } from "@/lib/billing/plans";
import { linkCustomer, loadAccount } from "@/lib/server/billing/account";
import { createCheckoutSession, ensureCustomer, purchasablePlans } from "@/lib/server/billing/stripe";
import { isSameOrigin, rateLimit, requireUser, siteOrigin } from "@/lib/server/guard";

/** POST /api/billing/checkout { plan } — starts a Stripe Checkout for a subscription. */
export async function POST(request: Request) {
  const user = await requireUser();
  if ("response" in user) return user.response;
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!rateLimit(`checkout:${user.userId}`, 10, 10 * 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as { plan?: unknown } | null;
  const plan = isPlanId(body?.plan) ? body.plan : null;
  if (!plan || plan === "free" || !purchasablePlans().includes(plan)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const record = await loadAccount(user.userId);
    const clerk = await clerkClient();
    const profile = await clerk.users.getUser(user.userId);
    const email = profile.emailAddresses.find((e) => e.id === profile.primaryEmailAddressId)?.emailAddress ?? null;

    const customerId = await ensureCustomer(user.userId, email, record.customerId);
    if (customerId !== record.customerId) await linkCustomer(user.userId, customerId);

    const url = await createCheckoutSession({
      userId: user.userId,
      customerId,
      plan: plan as Exclude<PlanId, "free">,
      origin: siteOrigin(request),
    });
    if (!url) return NextResponse.json({ error: "billing_unavailable" }, { status: 503 });
    return NextResponse.json({ url }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[billing/checkout]", error);
    return NextResponse.json({ error: "billing_unavailable" }, { status: 503 });
  }
}

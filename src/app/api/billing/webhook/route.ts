import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { syncFromStripe } from "@/lib/server/billing/account";
import { constructWebhookEvent, getStripe, StripeNotConfiguredError } from "@/lib/server/billing/stripe";

/**
 * POST /api/billing/webhook — Stripe tells us a subscription changed.
 *
 * Events can arrive late, out of order or more than once, so nothing is read from the event
 * payload beyond who it is about: the account is then re-synced from Stripe's current state,
 * which makes every delivery idempotent.
 */

const HANDLED = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
]);

const idOf = (value: unknown): string =>
  typeof value === "string" ? value : ((value as { id?: string } | null)?.id ?? "");

/** The Clerk account an event belongs to: from the object's metadata, else from the customer. */
async function resolveUserId(customerId: string, metadata?: Stripe.Metadata | null): Promise<string | null> {
  const tagged = metadata?.clerkUserId;
  if (tagged) return tagged;
  if (!customerId) return null;
  const customer = await getStripe().customers.retrieve(customerId);
  return customer.deleted ? null : (customer.metadata?.clerkUserId ?? null);
}

function subjectOf(event: Stripe.Event): { customerId: string; metadata: Stripe.Metadata | null } | null {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const metadata: Stripe.Metadata = { ...session.metadata };
      if (session.client_reference_id) metadata.clerkUserId = session.client_reference_id;
      return { customerId: idOf(session.customer), metadata };
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed": {
      const subscription = event.data.object;
      return { customerId: idOf(subscription.customer), metadata: subscription.metadata };
    }
    case "invoice.paid":
    case "invoice.payment_failed": {
      const invoice = event.data.object;
      return { customerId: idOf(invoice.customer), metadata: null };
    }
    default:
      return null;
  }
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = await constructWebhookEvent(body, signature);
  } catch (error) {
    if (error instanceof StripeNotConfiguredError) {
      console.error("[billing/webhook] STRIPE_WEBHOOK_SECRET is not set");
      return NextResponse.json({ error: "not_configured" }, { status: 503 });
    }
    // An unverified body is not ours: never act on it.
    console.warn("[billing/webhook] rejected signature:", (error as Error).message);
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  if (!HANDLED.has(event.type)) return NextResponse.json({ received: true });

  try {
    const subject = subjectOf(event);
    const userId = subject && (await resolveUserId(subject.customerId, subject.metadata));
    if (!userId || !subject?.customerId) {
      // Nothing to attribute this to: a customer created outside the app, most likely.
      console.warn(`[billing/webhook] ${event.type} without a known account`);
      return NextResponse.json({ received: true });
    }
    await syncFromStripe(userId, subject.customerId);
    return NextResponse.json({ received: true });
  } catch (error) {
    // 500 makes Stripe retry, which is what we want for a transient failure.
    console.error(`[billing/webhook] ${event.type} failed:`, error);
    return NextResponse.json({ error: "sync_failed" }, { status: 500 });
  }
}

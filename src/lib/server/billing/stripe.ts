import "server-only";
import Stripe from "stripe";
import { PAID_PLANS, type PlanId } from "@/lib/billing/plans";
import type { SubscriptionStatus } from "@/lib/billing/types";
import type { SubscriptionState } from "./record";

/**
 * Stripe is the source of truth for subscriptions: this module is the only place that talks to
 * it. Which plan a subscription grants is decided by its price id, so the three prices created
 * in the Stripe dashboard are wired to the catalogue through environment variables.
 */

export class StripeNotConfiguredError extends Error {
  constructor() {
    super("STRIPE_SECRET_KEY is not set");
    this.name = "StripeNotConfiguredError";
  }
}

const PRICE_ENV: Record<Exclude<PlanId, "free">, string> = {
  starter: "STRIPE_PRICE_STARTER",
  pro: "STRIPE_PRICE_PRO",
  max: "STRIPE_PRICE_MAX",
};

let client: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new StripeNotConfiguredError();
  client ??= new Stripe(key, { appInfo: { name: "Janob IELTS" } });
  return client;
}

export function priceIdFor(plan: PlanId): string | null {
  if (plan === "free") return null;
  return process.env[PRICE_ENV[plan]] || null;
}

/** Which plan a Stripe price grants, or `null` for a price this app does not know. */
export function planForPrice(priceId: string | null | undefined): PlanId | null {
  if (!priceId) return null;
  return PAID_PLANS.find((plan) => priceIdFor(plan.id) === priceId)?.id ?? null;
}

/** Plans that can actually be bought: Stripe configured and a price id present. */
export function purchasablePlans(): PlanId[] {
  if (!process.env.STRIPE_SECRET_KEY) return [];
  return PAID_PLANS.filter((plan) => priceIdFor(plan.id)).map((plan) => plan.id);
}

export function isCheckoutEnabled(): boolean {
  return purchasablePlans().length > 0;
}

const idOf = (value: string | { id: string } | null): string => (typeof value === "string" ? value : (value?.id ?? ""));

/**
 * Reads the parts of a subscription this app cares about. Since API version 2025-03-31 the
 * billing period lives on the subscription's items rather than on the subscription itself.
 */
export function subscriptionState(subscription: Stripe.Subscription): SubscriptionState | null {
  const item = subscription.items.data[0];
  const plan = planForPrice(item?.price?.id);
  // A subscription to a price this deployment does not know grants nothing.
  if (!plan) return null;
  return {
    plan,
    status: subscription.status as SubscriptionStatus,
    subscriptionId: subscription.id,
    customerId: idOf(subscription.customer as string | Stripe.Customer),
    periodStart: (item.current_period_start || subscription.start_date) * 1000,
    periodEnd: item.current_period_end ? item.current_period_end * 1000 : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  };
}

export async function fetchSubscription(subscriptionId: string): Promise<Stripe.Subscription | null> {
  try {
    return await getStripe().subscriptions.retrieve(subscriptionId);
  } catch (error) {
    if ((error as Stripe.errors.StripeError)?.code === "resource_missing") return null;
    throw error;
  }
}

/** The customer's newest subscription, whatever its state, or `null` if they never had one. */
export async function latestSubscription(customerId: string): Promise<Stripe.Subscription | null> {
  const list = await getStripe().subscriptions.list({ customer: customerId, status: "all", limit: 1 });
  return list.data[0] ?? null;
}

/** Finds this account's Stripe customer, or creates one tagged with the Clerk user id. */
export async function ensureCustomer(userId: string, email: string | null, known: string | null): Promise<string> {
  const stripe = getStripe();
  if (known) {
    const existing = await stripe.customers.retrieve(known).catch(() => null);
    if (existing && !existing.deleted) return existing.id;
  }
  if (email) {
    const found = await stripe.customers.search({
      query: `metadata['clerkUserId']:'${userId.replace(/'/g, "")}'`,
      limit: 1,
    });
    if (found.data[0]) return found.data[0].id;
  }
  const created = await stripe.customers.create({
    email: email ?? undefined,
    metadata: { clerkUserId: userId },
  });
  return created.id;
}

export async function createCheckoutSession(options: {
  userId: string;
  customerId: string;
  plan: Exclude<PlanId, "free">;
  origin: string;
}): Promise<string | null> {
  const price = priceIdFor(options.plan);
  if (!price) return null;
  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer: options.customerId,
    client_reference_id: options.userId,
    line_items: [{ price, quantity: 1 }],
    allow_promotion_codes: true,
    // Both the session and the subscription carry the account, so the webhook can always
    // resolve one even if the customer was created outside this app.
    metadata: { clerkUserId: options.userId, plan: options.plan },
    subscription_data: { metadata: { clerkUserId: options.userId, plan: options.plan } },
    // The plan is echoed back so the page can wait for the webhook to land before showing it.
    success_url: `${options.origin}/pricing?checkout=success&plan=${options.plan}`,
    cancel_url: `${options.origin}/pricing?checkout=cancelled`,
  });
  return session.url;
}

export async function createPortalSession(customerId: string, origin: string): Promise<string> {
  const session = await getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${origin}/pricing`,
  });
  return session.url;
}

export async function constructWebhookEvent(body: string, signature: string): Promise<Stripe.Event> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new StripeNotConfiguredError();
  return getStripe().webhooks.constructEventAsync(body, signature, secret);
}

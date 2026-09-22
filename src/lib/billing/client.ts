"use client";

import { useSyncExternalStore } from "react";
import type { BillingSnapshot } from "./types";

/**
 * The signed-in account's plan and token usage, kept in one browser-wide store so the sidebar
 * meter, the pricing page and the home screen all read the same thing. Anything that spends
 * tokens calls `refreshBilling()` afterwards.
 */

export interface BillingState {
  /** `null` until the first load finishes. */
  billing: BillingSnapshot | null;
  /** The snapshot could not be loaded; the app still works, the meter simply stays hidden. */
  failed: boolean;
}

const EMPTY: BillingState = { billing: null, failed: false };

let state: BillingState = EMPTY;
let owner: string | null = null;
let inFlight: Promise<BillingSnapshot | null> | null = null;
const listeners = new Set<() => void>();

function set(next: BillingState) {
  state = next;
  for (const listener of listeners) listener();
}

/** Points the store at the signed-in account, the way the test history does. */
export function setBillingOwner(userId: string) {
  // Module state on the server would be shared between requests; this store is browser-only.
  if (typeof window === "undefined" || owner === userId) return;
  owner = userId;
  state = EMPTY;
  inFlight = null;
}

export function refreshBilling(): Promise<BillingSnapshot | null> {
  inFlight ??= (async () => {
    try {
      const response = await fetch("/api/billing/me", { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const snapshot = (await response.json()) as BillingSnapshot;
      set({ billing: snapshot, failed: false });
      return snapshot;
    } catch {
      // Keep whatever was already loaded: a failed refresh should not blank the meter.
      set({ billing: state.billing, failed: true });
      return null;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/**
 * Asks the server to re-read the subscription from Stripe rather than trusting what is stored.
 * Used when returning from Checkout, so a new plan shows up even if the webhook is late or
 * never arrives. Falls back to a plain read if the sync itself fails.
 */
export async function syncBilling(): Promise<BillingSnapshot | null> {
  try {
    const response = await fetch("/api/billing/sync", { method: "POST" });
    if (!response.ok) throw new Error(String(response.status));
    const snapshot = (await response.json()) as BillingSnapshot;
    set({ billing: snapshot, failed: false });
    return snapshot;
  } catch {
    return refreshBilling();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!state.billing && !inFlight) void refreshBilling();
  return () => {
    listeners.delete(listener);
  };
}

export function useBilling(): BillingState {
  return useSyncExternalStore(subscribe, () => state, () => EMPTY);
}

/** 2_400_000 → "2.4M". Token counts are large, so the meter shows them short. */
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    const millions = tokens / 1_000_000;
    return `${millions >= 10 ? Math.round(millions) : Math.round(millions * 10) / 10}M`;
  }
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`;
  return String(Math.max(0, Math.round(tokens)));
}

/** Share of the allowance already spent, 0–1. */
export function usedShare(billing: BillingSnapshot): number {
  if (billing.limit <= 0) return 1;
  return Math.min(1, Math.max(0, billing.used / billing.limit));
}

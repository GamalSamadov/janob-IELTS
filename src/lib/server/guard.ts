import "server-only";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * The signed-in user's id, or a 401 response to return. The proxy already rejects anonymous
 * API calls; checking again here keeps every quota-spending route safe on its own.
 */
export async function requireUser(): Promise<{ userId: string } | { response: NextResponse }> {
  const { userId } = await auth();
  return userId ? { userId } : { response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
}

/** Best-effort, per-instance limits for the endpoints that spend API quota. */
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
  }
  return true;
}

/** Rejects cross-site browser requests; same-origin fetches and server-to-server calls pass. */
export function isSameOrigin(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === (request.headers.get("x-forwarded-host") ?? request.headers.get("host"));
  } catch {
    return false;
  }
}

/** Absolute origin of this deployment, for URLs handed to Stripe to redirect back to. */
export function siteOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/+$/, "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : new URL(request.url).origin;
}

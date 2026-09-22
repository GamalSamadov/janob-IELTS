import { NextResponse } from "next/server";
import { getSnapshot } from "@/lib/server/billing/account";
import { requireUser } from "@/lib/server/guard";

/** GET /api/billing/me — the account's plan and token usage. */
export async function GET() {
  const user = await requireUser();
  if ("response" in user) return user.response;

  try {
    const snapshot = await getSnapshot(user.userId);
    return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[billing/me]", error);
    return NextResponse.json({ error: "billing_unavailable" }, { status: 503 });
  }
}

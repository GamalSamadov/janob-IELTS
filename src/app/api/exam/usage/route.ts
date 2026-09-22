import { NextResponse } from "next/server";
import { settleExam } from "@/lib/server/billing/account";
import { isSameOrigin, requireUser } from "@/lib/server/guard";

/**
 * POST /api/exam/usage { examId, tokens } — the browser reports what a finished live session
 * cost. The figure only refines the reservation taken at `/api/live/token`: the server clamps
 * it between a floor derived from the session's real duration and the format's ceiling.
 *
 * Also reached through `navigator.sendBeacon` when the tab closes mid-test, so the body is read
 * as text rather than relying on a JSON content type.
 */
export async function POST(request: Request) {
  const user = await requireUser();
  if ("response" in user) return user.response;
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const raw = await request.text().catch(() => "");
  let body: { examId?: unknown; tokens?: unknown } | null = null;
  try {
    body = JSON.parse(raw || "null");
  } catch {
    body = null;
  }

  const examId = typeof body?.examId === "string" ? body.examId.slice(0, 64) : "";
  if (!examId) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const tokens = typeof body?.tokens === "number" && Number.isFinite(body.tokens) ? Math.max(0, body.tokens) : null;

  try {
    await settleExam(user.userId, examId, tokens);
  } catch (error) {
    // The reservation stays and is charged in full when it expires; never fail the caller.
    console.error("[exam/usage]", error);
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

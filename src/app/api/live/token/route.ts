import { NextResponse } from "next/server";
import { createPlan, MODE_RULES, resolvePlan, summarizePlan } from "@/lib/exam/plan";
import type { ExamMode, LiveTokenResponse } from "@/lib/exam/types";
import { buildExaminerPrompt, buildLiveConfig, LOCKED_FIELDS } from "@/lib/server/examiner";
import { reserveExam, settleExam } from "@/lib/server/billing/account";
import { errorCode, errorStatus, getGenAI, MODELS } from "@/lib/server/genai";
import { isSameOrigin, rateLimit, requireUser } from "@/lib/server/guard";
import { getVoice, isAccent } from "@/lib/voices";

export async function POST(request: Request) {
  const user = await requireUser();
  if ("response" in user) return user.response;
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!rateLimit(`token:${user.userId}`, 12, 10 * 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const voice = getVoice(typeof body?.voice === "string" ? body.voice : null);
  const accent = body?.accent;
  const mode = body?.mode;
  const hour = Number(body?.localHour);
  const examId = typeof body?.examId === "string" ? body.examId.slice(0, 64) : "";
  if (!voice || !isAccent(accent) || (mode !== "full" && mode !== "quick") || !/^[\w-]{6,64}$/.test(examId)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const examMode = mode as ExamMode;
  const localHour = Number.isInteger(hour) && hour >= 0 && hour < 24 ? hour : 12;

  // Hold this test's expected cost before spending anything. A reconnect asks for a new token
  // with the same exam id and reuses the hold, so one test is only ever charged once.
  let reservation;
  try {
    reservation = await reserveExam(user.userId, examId, examMode);
  } catch (error) {
    console.error("[live/token] billing", error);
    return NextResponse.json({ error: "billing_unavailable" }, { status: 503 });
  }
  if (!reservation.ok) {
    return NextResponse.json({ error: "limit_reached", billing: reservation.snapshot }, { status: 402 });
  }

  // Reconnects reuse the same plan so the examiner keeps the same topics.
  const requestedPlan = body?.plan;
  const plan = resolvePlan(requestedPlan, examMode) ? (requestedPlan as LiveTokenResponse["plan"]) : createPlan(examMode);
  const resolved = resolvePlan(plan, examMode)!;
  const rules = MODE_RULES[examMode];

  const systemInstruction = buildExaminerPrompt({ voice, accent, mode: examMode, plan: resolved, localHour });
  const config = buildLiveConfig(systemInstruction, voice.id);

  try {
    const now = Date.now();
    const examEnd = now + (rules.maxMinutes + 5) * 60_000;
    const token = await getGenAI().authTokens.create({
      config: {
        // Every reconnect with a resumption handle counts as a use (connections are
        // rotated about every 10 minutes).
        uses: 4,
        expireTime: new Date(examEnd + 5 * 60_000).toISOString(),
        newSessionExpireTime: new Date(examEnd).toISOString(),
        // Lock the examiner prompt, voice, tools and audio settings to this token. The browser
        // can only add unlocked fields, i.e. the session-resumption handle.
        liveConnectConstraints: { model: MODELS.live, config },
        lockAdditionalFields: [],
        // The SDK derives an invalid mask from nested values ("tools.0"), so send an explicit one.
        httpOptions: { extraBody: { fieldMask: LOCKED_FIELDS } },
      },
    });
    if (!token.name) throw new Error("Token response without a name");

    const payload: LiveTokenResponse = {
      token: token.name,
      model: MODELS.live,
      config: config as Record<string, unknown>,
      plan,
      summary: summarizePlan(resolved),
      examinerName: voice.name,
      prepSeconds: rules.prepSeconds,
      talkSeconds: rules.talkSeconds,
    };
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // Nothing was spent, so release the hold this call took. On a reconnect the hold belongs
    // to a session that is already running, so it has to stay.
    if (!reservation.reused) await settleExam(user.userId, examId, 0).catch(() => {});
    const code = errorCode(error);
    console.error("[live/token]", error);
    return NextResponse.json({ error: code }, { status: errorStatus(code) });
  }
}

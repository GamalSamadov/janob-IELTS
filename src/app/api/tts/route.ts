import { after, NextResponse } from "next/server";
import type { Accent } from "@/lib/exam/types";
import { chargeUsage } from "@/lib/server/billing/account";
import { errorCode, errorStatus } from "@/lib/server/genai";
import { isSameOrigin, rateLimit, requireUser } from "@/lib/server/guard";
import { synthesize, type SpeechAudio } from "@/lib/server/tts";
import { getVoice, isAccent } from "@/lib/voices";

const MAX_TEXT = 1500;
const cache = new Map<string, SpeechAudio>();

function remember(key: string, audio: SpeechAudio) {
  cache.set(key, audio);
  if (cache.size > 80) cache.delete(cache.keys().next().value!);
}

function audioResponse(audio: SpeechAudio, cacheable: boolean) {
  return new Response(new Uint8Array(audio.data), {
    headers: {
      "Content-Type": audio.mimeType,
      "Content-Length": String(audio.data.length),
      "Cache-Control": cacheable ? "public, max-age=86400, s-maxage=2592000" : "private, max-age=3600",
    },
  });
}

async function speak(userId: string, key: string, run: () => Promise<SpeechAudio>, cacheable: boolean) {
  const hit = cache.get(key);
  if (hit) return audioResponse(hit, cacheable);
  if (!rateLimit(`tts:${userId}`, 40, 10 * 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  try {
    const audio = await run();
    remember(key, audio);
    // Playback is small next to a test, but it is Gemini usage all the same. Cache hits above
    // never reach here, so a phrase is only ever charged once.
    after(() => chargeUsage(userId, audio.tokens));
    return audioResponse(audio, cacheable);
  } catch (error) {
    const code = errorCode(error);
    console.error("[tts]", error);
    return NextResponse.json({ error: code }, { status: errorStatus(code) });
  }
}

/** Voice preview for the examiner picker: GET /api/tts?voice=Kore&accent=british */
export async function GET(request: Request) {
  const user = await requireUser();
  if ("response" in user) return user.response;
  const params = new URL(request.url).searchParams;
  const voice = getVoice(params.get("voice"));
  const accent = params.get("accent") ?? "british";
  if (!voice || !isAccent(accent)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  return speak(
    user.userId,
    `preview:${voice.id}:${accent}`,
    () =>
      synthesize({
        voice: voice.id,
        accent,
        style: `in a ${voice.manner} tone, like an IELTS examiner welcoming a candidate`,
        text: `Hello, my name is ${voice.name}, and I'll be your examiner today. Shall we begin your speaking test?`,
      }),
    true,
  );
}

/** Reads a model answer aloud: POST /api/tts { text, voice, accent } */
export async function POST(request: Request) {
  const user = await requireUser();
  if ("response" in user) return user.response;
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { text?: unknown; voice?: unknown; accent?: unknown } | null;
  const voice = getVoice(typeof body?.voice === "string" ? body.voice : null);
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, MAX_TEXT) : "";
  const accent: Accent = isAccent(body?.accent) ? body.accent : "british";
  if (!voice || !text) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  return speak(
    user.userId,
    `answer:${voice.id}:${accent}:${text}`,
    () =>
      synthesize({
        voice: voice.id,
        accent,
        style: "relaxed and natural, like a fluent speaker answering an interview question",
        text,
      }),
    false,
  );
}

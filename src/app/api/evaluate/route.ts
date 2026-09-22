import { NextResponse } from "next/server";
import type { ExamPart, TranscriptEntry } from "@/lib/exam/types";
import { evaluateTest, geminiAudioMime, type CandidateAudio } from "@/lib/server/evaluator";
import { errorCode, errorStatus } from "@/lib/server/genai";
import { isSameOrigin, rateLimit, requireUser } from "@/lib/server/guard";
import { getVoice, isAccent } from "@/lib/voices";

// Transcription + a high-thinking assessment of up to ~15 minutes of audio.
export const maxDuration = 300;

const MAX_AUDIO_BYTES = 18 * 1024 * 1024; // inline request limit is 20 MB

const ROLES: TranscriptEntry["role"][] = ["examiner", "candidate", "divider"];

function parseTranscript(value: unknown): TranscriptEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: TranscriptEntry[] = [];
  for (const [i, raw] of value.slice(0, 600).entries()) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    const role = ROLES.find((r) => r === entry.role);
    if (!role) continue;
    entries.push({
      id: String(entry.id ?? i),
      role,
      part: [0, 1, 2, 3].includes(Number(entry.part)) ? (Number(entry.part) as ExamPart) : 0,
      text: String(entry.text ?? "").slice(0, 4000),
      lang: typeof entry.lang === "string" ? entry.lang.slice(0, 12) : undefined,
    });
  }
  return entries;
}

export async function POST(request: Request) {
  const user = await requireUser();
  if ("response" in user) return user.response;
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!rateLimit(`evaluate:${user.userId}`, 10, 10 * 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const form = await request.formData().catch(() => null);
  const metaRaw = form?.get("meta");
  let meta: Record<string, unknown> | null = null;
  try {
    meta = typeof metaRaw === "string" ? JSON.parse(metaRaw) : null;
  } catch {
    meta = null;
  }
  const setup = (meta?.setup ?? {}) as Record<string, unknown>;
  const voice = getVoice(typeof setup.voice === "string" ? setup.voice : null);
  if (!meta || !voice || !isAccent(setup.accent) || (setup.mode !== "full" && setup.mode !== "quick")) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const transcript = parseTranscript(meta.transcript);
  if (!transcript.some((e) => e.role === "candidate" && e.text.trim())) {
    return NextResponse.json({ error: "no_speech" }, { status: 422 });
  }

  let audio: CandidateAudio | null = null;
  const file = form?.get("audio");
  if (file instanceof Blob && file.size > 1024) {
    if (file.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: "audio_too_large" }, { status: 413 });
    }
    audio = {
      base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
      mimeType: geminiAudioMime(file.type),
    };
  }

  try {
    const result = await evaluateTest({
      audio,
      transcript,
      setup: { voice: voice.id, accent: setup.accent, mode: setup.mode },
      examinerName: voice.name,
      cueCardTitle: typeof meta.cueCardTitle === "string" ? meta.cueCardTitle.slice(0, 200) : undefined,
      durationSec: Number(meta.durationSec) || 0,
      candidateSpeechSec: Number(meta.candidateSpeechSec) || 0,
      feedbackLang: meta.feedbackLang === "en" ? "en" : "uz",
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = errorCode(error);
    console.error("[evaluate]", error);
    return NextResponse.json({ error: code }, { status: errorStatus(code) });
  }
}

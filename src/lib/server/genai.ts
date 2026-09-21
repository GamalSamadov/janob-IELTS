import "server-only";
import { GoogleGenAI } from "@google/genai";

/** Every model can be swapped through env vars without touching code. */
export const MODELS = {
  /** Real-time examiner (native audio in/out, Uzbek + English). */
  live: process.env.GEMINI_LIVE_MODEL || "gemini-3.8-live",
  /** Speech-to-text for the candidate's recording (code-switching EN/UZ, verbatim). */
  transcribe: process.env.GEMINI_TRANSCRIBE_MODEL || "gemini-3.5-transcribe",
  /** Band-score assessment over audio + transcripts. */
  evaluator: process.env.GEMINI_EVAL_MODEL || "gemini-3.8-flash",
  /** Voice previews and model-answer playback. */
  tts: process.env.GEMINI_TTS_MODEL || "gemini-3.1-flash-tts-preview",
} as const;

export class MissingApiKeyError extends Error {
  constructor() {
    super("GEMINI_API_KEY is not set");
    this.name = "MissingApiKeyError";
  }
}

let client: GoogleGenAI | null = null;

export function getGenAI(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new MissingApiKeyError();
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

/** Maps SDK/API failures to a short machine-readable code for the UI. */
export function errorCode(error: unknown): string {
  if (error instanceof MissingApiKeyError) return "not_configured";
  const status = (error as { status?: number })?.status;
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limited";
  return "upstream";
}

export function errorStatus(code: string): number {
  if (code === "not_configured") return 503;
  if (code === "rate_limited") return 429;
  return 502;
}

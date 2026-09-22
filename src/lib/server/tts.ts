import "server-only";
import type { Accent } from "@/lib/exam/types";
import { tokensFrom } from "./billing/usage";
import { getGenAI, MODELS } from "./genai";

const ACCENT_NAME: Record<Accent, string> = {
  british: "a natural British English accent",
  american: "a natural American English accent",
  australian: "a natural Australian English accent",
};

function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export interface SpeechAudio {
  data: Buffer;
  mimeType: string;
  /** Tokens this synthesis spent; 0 when the API reported none. */
  tokens: number;
}

async function generate(input: string, voice: string) {
  const interaction = await getGenAI().interactions.create({
    model: MODELS.tts,
    input,
    response_format: { type: "audio" },
    generation_config: { speech_config: [{ voice }] },
    store: false,
  });
  return { audio: interaction.output_audio, tokens: tokensFrom(interaction.usage) };
}

/** Gemini TTS. Raw PCM output is wrapped into WAV so browsers can play it directly. */
export async function synthesize(opts: { text: string; voice: string; accent: Accent; style: string }): Promise<SpeechAudio> {
  let result;
  try {
    result = await generate(`Say in ${ACCENT_NAME[opts.accent]}, ${opts.style}: ${opts.text}`, opts.voice);
  } catch (error) {
    // The TTS model occasionally aborts a stream ("audio stream could not be completed");
    // a retry with a plainer instruction usually succeeds.
    const status = (error as { status?: number })?.status ?? 0;
    if (status === 401 || status === 403 || status === 429) throw error;
    console.warn("[tts] retrying after:", (error as Error).message?.slice(0, 120));
    result = await generate(`Read aloud in ${ACCENT_NAME[opts.accent]}: ${opts.text}`, opts.voice);
  }

  const out = result.audio;
  if (!out?.data) throw new Error("TTS returned no audio");
  const bytes = Buffer.from(out.data, "base64");
  const mime = (out.mime_type ?? "").toLowerCase();
  if (mime.includes("wav")) return { data: bytes, mimeType: "audio/wav", tokens: result.tokens };

  // "audio/l16; rate=24000": despite the MIME type, the samples are little-endian (verified).
  const rate = out.sample_rate || Number(/rate=(\d+)/.exec(mime)?.[1]) || 24000;
  return { data: pcmToWav(bytes, rate), mimeType: "audio/wav", tokens: result.tokens };
}

/**
 * Pre-renders the examiner voice previews to public/voices/<Voice>-<accent>.mp3 so the picker
 * plays them instantly instead of waiting for Gemini TTS.
 *
 * Needs the dev server (npm run dev) and ffmpeg:
 *   npx tsx scripts/generate-voice-previews.ts
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ACCENTS, VOICES } from "../src/lib/voices";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const OUT_DIR = join(process.cwd(), "public", "voices");

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const voice of VOICES) {
    for (const accent of ACCENTS) {
      const response = await fetch(`${APP_URL}/api/tts?voice=${voice.id}&accent=${accent}`);
      if (!response.ok) throw new Error(`${voice.id}/${accent}: HTTP ${response.status} ${await response.text()}`);
      const wav = join(OUT_DIR, `${voice.id}-${accent}.wav`);
      const mp3 = join(OUT_DIR, `${voice.id}-${accent}.mp3`);
      writeFileSync(wav, Buffer.from(await response.arrayBuffer()));
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", wav, "-ac", "1", "-b:a", "64k", mp3]);
      rmSync(wav);
      console.log("✓", `${voice.id}-${accent}.mp3`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

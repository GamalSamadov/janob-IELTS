import type { Accent } from "./exam/types";

export interface ExaminerVoice {
  /** Gemini prebuilt voice name (shared by the Live API and Gemini TTS). */
  id: string;
  /** Persona name the examiner introduces themself with. */
  name: string;
  gender: "female" | "male";
  trait: { en: string; uz: string };
  /** Speaking manner injected into the examiner system prompt. */
  manner: string;
  /** Avatar hue (OKLCH). */
  hue: number;
}

export const VOICES: ExaminerVoice[] = [
  {
    id: "Kore",
    name: "Emma",
    gender: "female",
    trait: { en: "Firm · clear", uz: "Qat’iy · aniq" },
    manner: "professional, firm and clear",
    hue: 25,
  },
  {
    id: "Charon",
    name: "James",
    gender: "male",
    trait: { en: "Calm · informative", uz: "Xotirjam · tushunarli" },
    manner: "calm, measured and informative",
    hue: 250,
  },
  {
    id: "Aoede",
    name: "Sophie",
    gender: "female",
    trait: { en: "Breezy · friendly", uz: "Yengil · samimiy" },
    manner: "relaxed, friendly and natural",
    hue: 160,
  },
  {
    id: "Orus",
    name: "Daniel",
    gender: "male",
    trait: { en: "Formal · firm", uz: "Rasmiy · qat’iy" },
    manner: "formal, businesslike and firm",
    hue: 215,
  },
  {
    id: "Sulafat",
    name: "Olivia",
    gender: "female",
    trait: { en: "Warm · supportive", uz: "Iliq · dalda beruvchi" },
    manner: "warm and encouraging in tone, while staying neutral about the candidate's performance",
    hue: 60,
  },
  {
    id: "Puck",
    name: "Leo",
    gender: "male",
    trait: { en: "Upbeat · lively", uz: "Quvnoq · g‘ayratli" },
    manner: "upbeat and lively, but still professional",
    hue: 300,
  },
  {
    id: "Gacrux",
    name: "Helen",
    gender: "female",
    trait: { en: "Mature · serious", uz: "Tajribali · jiddiy" },
    manner: "mature, experienced, calm and serious",
    hue: 350,
  },
  {
    id: "Iapetus",
    name: "Oliver",
    gender: "male",
    trait: { en: "Clear · neutral", uz: "Aniq · betaraf" },
    manner: "clear, neutral and even-paced",
    hue: 190,
  },
];

export const DEFAULT_VOICE_ID = VOICES[0].id;

export function getVoice(id: string | null | undefined): ExaminerVoice | undefined {
  return VOICES.find((v) => v.id === id);
}

export const ACCENTS: Accent[] = ["british", "american", "australian"];

export const ACCENT_PROMPT: Record<Accent, string> = {
  british: "a standard British English (Southern British / RP-like) accent, using British vocabulary and spelling",
  american: "a standard General American English accent",
  australian: "a light, clear Australian English accent",
};

export function isAccent(value: unknown): value is Accent {
  return typeof value === "string" && (ACCENTS as string[]).includes(value);
}

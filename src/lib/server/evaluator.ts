import "server-only";
import { ThinkingLevel } from "@google/genai";
import { clampBand, CRITERIA, overallBand } from "@/lib/exam/scoring";
import type { Evaluation, ExamSetup, Lang, TranscriptEntry } from "@/lib/exam/types";
import { tokensFrom } from "./billing/usage";
import { getGenAI, MODELS } from "./genai";

export interface CandidateAudio {
  base64: string;
  mimeType: string;
}

export interface EvaluateInput {
  audio: CandidateAudio | null;
  transcript: TranscriptEntry[];
  setup: ExamSetup;
  examinerName: string;
  cueCardTitle?: string;
  durationSec: number;
  candidateSpeechSec: number;
  feedbackLang: Lang;
}

/** Normalises browser MediaRecorder types to the MIME types Gemini accepts. */
export function geminiAudioMime(browserMime: string): string {
  const base = browserMime.split(";")[0].trim().toLowerCase();
  if (base === "audio/mp4" || base === "audio/x-m4a") return "audio/m4a";
  if (base === "audio/x-wav") return "audio/wav";
  return base || "audio/webm";
}

/** Verbatim speech-to-text of the candidate's recording (English with possible Uzbek code-switching). */
export async function transcribeCandidate(audio: CandidateAudio): Promise<{ text: string | null; tokens: number }> {
  try {
    const interaction = await getGenAI().interactions.create({
      model: MODELS.transcribe,
      input: [{ type: "audio", data: audio.base64, mime_type: audio.mimeType }],
      generation_config: {
        transcription_config: { language_codes: ["en-US", "uz-UZ"], mode: "verbatim" },
      },
      store: false,
    });
    return { text: interaction.output_text?.trim() || null, tokens: tokensFrom(interaction.usage) };
  } catch (error) {
    // The evaluator can still work from the audio and the live captions.
    console.warn("[evaluate] transcription failed:", error);
    return { text: null, tokens: 0 };
  }
}

const EVALUATOR_SYSTEM = `You are a senior, certified IELTS Speaking examiner and an experienced teacher of English to Uzbek-speaking learners. You rate recorded mock Speaking tests exactly as an official examiner would, using the four public IELTS Speaking criteria, and then give the candidate precise, practical advice.

RATING RULES
- Rate each criterion with a whole band from 0 to 9. Be strict and fair; do not inflate. Base every judgement on evidence you can hear in the audio or read in the transcript. Most intermediate learners fall between 5 and 6.5.
- Use the audio as the primary evidence for Fluency and Pronunciation (speed, pauses, hesitation, self-correction, word and sentence stress, intonation, rhythm, connected speech, individual sounds). Transcripts may contain recognition errors: when they disagree with the audio, trust the audio.
- Rate only the candidate, never the examiner.
- A band requires its key features to be present across the test. When a performance is between two bands, choose the lower one unless most features of the higher band are clearly present.
- Answers given in Uzbek or Russian are not rateable English. Code-switching shows gaps in vocabulary and hurts Lexical Resource and Fluency; very short answers limit what can be credited.
- If the candidate produced little English speech (roughly under one minute in total, or only a few short answers), set sampleSufficient to false and rate conservatively.

CRITERIA (condensed descriptors)
Fluency and Coherence
 9: fluent, only rare repetition or self-correction; any hesitation is about ideas, not language; fully coherent, topics fully developed.
 8: fluent with occasional repetition/self-correction; hesitation mostly about content; develops topics coherently and appropriately.
 7: speaks at length without noticeable effort or loss of coherence; some language-related hesitation, repetition or self-correction; uses a range of connectives and discourse markers with some flexibility.
 6: willing to speak at length but sometimes loses coherence through repetition, self-correction or hesitation; uses a range of connectives, not always appropriately.
 5: usually keeps going but relies on repetition, self-correction and/or slow speech; overuses some connectives; fluent on simple topics, problems with more complex ones.
 4: cannot answer without noticeable pauses; slow speech with frequent repetition; links only basic sentences with simple, repetitive connectives; coherence breaks down.
 3: long pauses, very limited linking, often unable to convey the basic message.
Lexical Resource
 9: full flexibility and precision; idiomatic language used naturally and accurately.
 8: wide, flexible resource conveying precise meaning; skilful use of less common and idiomatic items with occasional inaccuracy; effective paraphrase.
 7: flexible enough for a variety of topics; some less common and idiomatic vocabulary with awareness of style and collocation, some inappropriate choices; effective paraphrase.
 6: wide enough to discuss topics at length and make meaning clear despite inappropriacies; generally paraphrases successfully.
 5: manages familiar and unfamiliar topics with limited flexibility; paraphrase attempts with mixed success.
 4: enough for familiar topics only; frequent errors in word choice; rarely paraphrases.
Grammatical Range and Accuracy
 9: full range of structures used naturally; consistently accurate apart from native-like slips.
 8: wide range used flexibly; most sentences error-free; only occasional inappropriacies or non-systematic errors.
 7: a range of complex structures with some flexibility; frequent error-free sentences, though some errors persist.
 6: mix of simple and complex structures with limited flexibility; frequent errors in complex structures that rarely impede communication.
 5: basic sentence forms reasonably accurate; limited complex structures that usually contain errors and may cause misunderstanding.
 4: basic forms and some correct simple sentences; subordinate clauses rare; frequent errors that can cause misunderstanding.
Pronunciation
 9: full range of features with precision and subtlety; effortless to understand; accent has no effect on intelligibility.
 8: wide range of features, flexible use with only occasional lapses; easy to understand throughout; L1 accent has minimal effect.
 7: all positive features of band 6 and some, but not all, of band 8.
 6: a range of features with mixed control; generally understood throughout, but mispronounced words or sounds sometimes reduce clarity.
 5: all positive features of band 4 and some, but not all, of band 6.
 4: limited range of features; frequent lapses and mispronunciations cause some difficulty for the listener.
Typical difficulties for Uzbek speakers (mention them ONLY if you actually hear them): /w/ pronounced as /v/; /θ/ and /ð/ replaced by /t/, /d/, /s/ or /z/; short vs long vowels (ship/sheep, full/fool); final voiced consonants devoiced (bed → bet); trilled /r/; missing weak forms and schwa; flat or syllable-timed rhythm; misplaced word stress.

FEEDBACK RULES
- Address the candidate directly as "you" (in Uzbek: "siz"), never as "the candidate".
- Comments must be specific to this candidate: name what they did, quote short examples of their own words, and say what separates them from the next band.
- corrections: 3–8 of the most important grammar or word-choice errors, quoted from the candidate's real answers, each with a natural corrected version and a one-sentence explanation. If there are very few errors, give fewer.
- vocabulary: 4–8 simple or overused words and phrases the candidate actually used, each with 2–3 more precise or less common alternatives that fit the same context and an example sentence in natural spoken English.
- nativeLanguage: every Uzbek or Russian word or phrase the candidate used, with the English they should have used. Empty if none.
- pronunciation: 2–6 concrete words or sounds the candidate mispronounced, what went wrong and how to fix it (use simple respelling, e.g. "THREE — tongue between the teeth"). Empty only if there were no noticeable problems.
- studyPlan: 4–6 concrete, doable steps for the next 2–4 weeks, focused first on the weakest criterion (what to practise, how, how often).
- modelAnswers: 2–3 questions that were really asked in this test (one from Part 1, the Part 2 topic if it was reached, one from Part 3 if reached; never the name or introduction questions), each with a natural band 8–9 spoken answer that the candidate could realistically learn from: Part 1 about 50–70 words, Part 2 about 170–200 words, Part 3 about 80–110 words. Build the answers on the candidate's own situation and ideas from the test (their job or studies, city, opinions), expressed at band 8–9. Conversational, not written-style English.
- strengths and improvements: 3–5 short, specific points each.`;

const text = { type: "string" };

function arrayOf(properties: Record<string, unknown>, description: string) {
  return {
    type: "array",
    description,
    items: { type: "object", properties, required: Object.keys(properties) },
  };
}

const criterion = {
  type: "object",
  properties: {
    band: { type: "integer", minimum: 0, maximum: 9 },
    comment: { type: "string", description: "2–4 sentences of specific evidence and what is needed for the next band." },
  },
  required: ["band", "comment"],
};

const EVALUATION_SCHEMA = {
  type: "object",
  properties: {
    criteria: {
      type: "object",
      properties: { fluency: criterion, lexical: criterion, grammar: criterion, pronunciation: criterion },
      required: [...CRITERIA],
    },
    summary: { type: "string", description: "3–5 sentence overall verdict addressed to the candidate." },
    strengths: { type: "array", items: text },
    improvements: { type: "array", items: text },
    corrections: arrayOf({ original: text, corrected: text, explanation: text }, "Errors quoted from the candidate."),
    vocabulary: arrayOf(
      { used: text, alternatives: { type: "array", items: text }, example: text },
      "Vocabulary upgrades for words the candidate used.",
    ),
    nativeLanguage: arrayOf({ said: text, english: text }, "Uzbek/Russian words the candidate used."),
    pronunciation: arrayOf({ word: text, issue: text, tip: text }, "Specific pronunciation problems heard."),
    studyPlan: arrayOf({ title: text, detail: text }, "Actionable study steps."),
    modelAnswers: arrayOf({ part: { type: "integer" }, question: text, answer: text }, "Band 8–9 sample answers."),
    sampleSufficient: { type: "boolean" },
  },
  required: [
    "criteria",
    "summary",
    "strengths",
    "improvements",
    "corrections",
    "vocabulary",
    "nativeLanguage",
    "pronunciation",
    "studyPlan",
    "modelAnswers",
    "sampleSufficient",
  ],
};

function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function conversationLog(transcript: TranscriptEntry[]): string {
  return transcript
    .filter((e) => e.role !== "divider" && e.text.trim())
    .map((e) => {
      const who = e.role === "examiner" ? "Examiner" : "Candidate";
      const lang = e.role === "candidate" && e.lang && !e.lang.startsWith("en") ? ` (detected language: ${e.lang})` : "";
      const part = e.part === 0 ? "Intro" : `Part ${e.part}`;
      return `[${part}] ${who}${lang}: ${e.text.trim()}`;
    })
    .join("\n");
}

function buildUserPrompt(input: EvaluateInput, verbatim: string | null): string {
  const feedbackLanguage =
    input.feedbackLang === "uz"
      ? "Uzbek (Latin script, modern standard spelling: write oʻ and gʻ with the ‘ character, e.g. “o‘zbek”, “to‘g‘ri”, and use ’ for the tutuq belgisi, e.g. “ma’no”)"
      : "English";
  const audioNote = input.audio
    ? "The attached recording contains ONLY the candidate's speech: the examiner's turns and the silent Part 2 preparation minute were removed, so the answers follow one another. Silences inside an answer are genuine hesitation."
    : "No audio recording is available for this test. Judge fluency and pronunciation cautiously from the transcript and mention in the pronunciation comment that the audio was missing.";

  return `Assess this IELTS Speaking mock test.

TEST INFORMATION
- Format: ${input.setup.mode === "full" ? "full test (Parts 1–3)" : "quick test (shortened Parts 1 and 3, full Part 2)"}
- Examiner: ${input.examinerName}
- Total duration: ${clock(input.durationSec)}; candidate speaking time: about ${clock(input.candidateSpeechSec)}
- Part 2 topic card: ${input.cueCardTitle ?? "not reached"}

AUDIO
${audioNote}

SPEECH-TO-TEXT OF THE CANDIDATE'S RECORDING (verbatim, including fillers; may contain recognition errors)
"""
${verbatim ?? "(not available)"}
"""

LIVE CONVERSATION LOG (real-time captions; the candidate's lines may contain recognition errors)
"""
${conversationLog(input.transcript) || "(empty)"}
"""

Write every piece of feedback prose (criterion comments, summary, strengths, improvements, explanations, pronunciation issues and tips, study plan titles and details) in ${feedbackLanguage}. Keep quotations of the candidate's words, corrected sentences, vocabulary alternatives, example sentences, questions and model answers in English.`;
}

type Raw = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const list = (v: unknown): Raw[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Raw[]) : []);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

function normalize(raw: Raw, input: EvaluateInput, transcribed: boolean): Evaluation {
  const rawCriteria = (raw.criteria ?? {}) as Record<string, Raw>;
  const criteria = Object.fromEntries(
    CRITERIA.map((key) => [key, { band: clampBand(rawCriteria[key]?.band), comment: str(rawCriteria[key]?.comment) }]),
  ) as Evaluation["criteria"];

  return {
    overall: overallBand(CRITERIA.map((key) => criteria[key].band)),
    criteria,
    summary: str(raw.summary),
    strengths: strings(raw.strengths),
    improvements: strings(raw.improvements),
    corrections: list(raw.corrections)
      .map((c) => ({ original: str(c.original), corrected: str(c.corrected), explanation: str(c.explanation) }))
      .filter((c) => c.original && c.corrected),
    vocabulary: list(raw.vocabulary)
      .map((v) => ({ used: str(v.used), alternatives: strings(v.alternatives), example: str(v.example) }))
      .filter((v) => v.used && v.alternatives.length),
    nativeLanguage: list(raw.nativeLanguage)
      .map((n) => ({ said: str(n.said), english: str(n.english) }))
      .filter((n) => n.said && n.english),
    pronunciation: list(raw.pronunciation)
      .map((p) => ({ word: str(p.word), issue: str(p.issue), tip: str(p.tip) }))
      .filter((p) => p.word),
    studyPlan: list(raw.studyPlan)
      .map((s) => ({ title: str(s.title), detail: str(s.detail) }))
      .filter((s) => s.title),
    modelAnswers: list(raw.modelAnswers)
      .map((m) => ({ part: Math.min(3, Math.max(1, Math.round(Number(m.part) || 1))), question: str(m.question), answer: str(m.answer) }))
      .filter((m) => m.question && m.answer),
    sampleSufficient: raw.sampleSufficient !== false,
    feedbackLang: input.feedbackLang,
    models: { live: MODELS.live, transcribe: transcribed ? MODELS.transcribe : null, evaluator: MODELS.evaluator },
  };
}

/** `tokens` is what this assessment spent, for the caller to charge to the account. */
export async function evaluateTest(
  input: EvaluateInput,
): Promise<{ evaluation: Evaluation; verbatim: string | null; tokens: number }> {
  const transcription = input.audio ? await transcribeCandidate(input.audio) : { text: null, tokens: 0 };
  const verbatim = transcription.text;
  let tokens = transcription.tokens;
  const parts = [
    ...(input.audio ? [{ inlineData: { mimeType: input.audio.mimeType, data: input.audio.base64 } }] : []),
    { text: buildUserPrompt(input, verbatim) },
  ];

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await getGenAI().models.generateContent({
        model: MODELS.evaluator,
        contents: [{ role: "user", parts }],
        config: {
          systemInstruction: EVALUATOR_SYSTEM,
          responseMimeType: "application/json",
          responseJsonSchema: EVALUATION_SCHEMA,
          thinkingConfig: { thinkingLevel: attempt === 0 ? ThinkingLevel.HIGH : ThinkingLevel.MEDIUM },
        },
      });
      tokens += tokensFrom(response.usageMetadata);
      const raw = JSON.parse(response.text ?? "") as Raw;
      return { evaluation: normalize(raw, input, verbatim !== null), verbatim, tokens };
    } catch (error) {
      // Retry only malformed output or server-side hiccups, not configuration/auth problems.
      const status = (error as { status?: number })?.status ?? 0;
      if (!(error instanceof SyntaxError) && status < 500) throw error;
      lastError = error;
      console.warn(`[evaluate] attempt ${attempt + 1} failed:`, error);
    }
  }
  throw lastError;
}

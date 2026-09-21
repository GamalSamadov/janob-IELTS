export type Lang = "uz" | "en";
export type ExamMode = "full" | "quick";
export type Accent = "british" | "american" | "australian";
/** 0 = introduction (name/ID check), 1–3 = the three parts of the Speaking test. */
export type ExamPart = 0 | 1 | 2 | 3;

export interface ExamSetup {
  /** Gemini prebuilt voice name, e.g. "Kore". */
  voice: string;
  accent: Accent;
  mode: ExamMode;
}

export interface CueCard {
  id: string;
  /** "Describe a person who has inspired you." */
  title: string;
  /** The "You should say:" bullet points. */
  prompts: string[];
  /** The final "and explain …" line. */
  explain: string;
}

/** Topic ids picked for one test. Sent back to the server when a new token is needed. */
export interface ExamPlan {
  part1TopicIds: string[];
  cueCardId: string;
}

/** What the browser needs to know about the plan (the cue card is shown on screen in Part 2). */
export interface PlanSummary {
  part1Topics: string[];
  cueCard: CueCard;
  part3Theme: string;
}

export type Speaker = "examiner" | "candidate";

export interface TranscriptEntry {
  id: string;
  role: Speaker | "divider";
  text: string;
  part: ExamPart;
  /** BCP-47 code reported by live transcription (e.g. "uz", "en"). */
  lang?: string;
  interrupted?: boolean;
}

export interface CriterionScore {
  band: number;
  comment: string;
}

export type CriterionKey = "fluency" | "lexical" | "grammar" | "pronunciation";

export interface Evaluation {
  overall: number;
  criteria: Record<CriterionKey, CriterionScore>;
  summary: string;
  strengths: string[];
  improvements: string[];
  corrections: { original: string; corrected: string; explanation: string }[];
  vocabulary: { used: string; alternatives: string[]; example: string }[];
  nativeLanguage: { said: string; english: string }[];
  pronunciation: { word: string; issue: string; tip: string }[];
  studyPlan: { title: string; detail: string }[];
  modelAnswers: { part: number; question: string; answer: string }[];
  sampleSufficient: boolean;
  feedbackLang: Lang;
  models: { live: string; transcribe: string | null; evaluator: string };
}

export interface SessionRecord {
  id: string;
  createdAt: number;
  setup: ExamSetup;
  examinerName: string;
  durationSec: number;
  candidateSpeechSec: number;
  cueCardTitle?: string;
  transcript: TranscriptEntry[];
  /** Verbatim transcript of the candidate's audio from the speech-to-text model. */
  verbatim?: string | null;
  evaluation: Evaluation;
}

/** Response of POST /api/live/token */
export interface LiveTokenResponse {
  token: string;
  model: string;
  /** LiveConnectConfig mirrored to the client (the token is locked to the same values). */
  config: Record<string, unknown>;
  plan: ExamPlan;
  summary: PlanSummary;
  examinerName: string;
  prepSeconds: number;
  talkSeconds: number;
}

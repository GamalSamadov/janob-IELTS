import type {
  FunctionCall,
  FunctionResponse,
  FunctionResponseScheduling,
  GoogleGenAI,
  LiveServerMessage,
  Session,
} from "@google/genai";
import { MODE_RULES } from "@/lib/exam/plan";
import type { ExamPart, ExamSetup, Lang, LiveTokenResponse, PlanSummary, TranscriptEntry } from "@/lib/exam/types";
import { AnswerRecorder, base64FromBuffer, createAudioContext, MicCapture, PcmPlayer } from "./audio";

export type ExamStatus = "connecting" | "live" | "reconnecting" | "ending" | "finished" | "error";

export interface LiveEntry extends TranscriptEntry {
  /** Still being spoken / transcribed. */
  live?: boolean;
}

export interface ExamSnapshot {
  status: ExamStatus;
  part: ExamPart;
  entries: LiveEntry[];
  examinerSpeaking: boolean;
  micMuted: boolean;
  /** Part 2 preparation countdown. */
  prep: { endsAt: number; total: number } | null;
  /** Part 2 long-turn timer. */
  talk: { startedAt: number; total: number } | null;
  cueCardVisible: boolean;
  /** Topics of this test (known once the session token has been issued). */
  plan: PlanSummary | null;
  startedAt: number | null;
  error: string | null;
}

export interface ExamResult {
  transcript: TranscriptEntry[];
  audio: Blob | null;
  durationSec: number;
  candidateSpeechSec: number;
}

const SIGNAL = {
  start: "[START] The candidate is seated and ready. Begin the test now.",
  prepOver: "[PREP_TIME_OVER] The one-minute preparation time is over.",
  timeUp: "[TIME_UP] Two minutes are up. Politely stop the candidate now.",
};

const SILENT = "SILENT" as FunctionResponseScheduling;
const WHEN_IDLE = "WHEN_IDLE" as FunctionResponseScheduling;
const MAX_RECONNECTS = 3;

/** Live caption deltas sometimes lose the space between words ("examinertoday"). */
function appendChunk(text: string, chunk: string): string {
  if (!text || !chunk || /\s$/.test(text) || !/^[\p{L}\p{N}]/u.test(chunk) || /[‘’ʻ'-]$/.test(text)) {
    return text + chunk;
  }
  return `${text} ${chunk}`;
}

const UZBEK_WORDS = new Set(
  (
    "siz sizga sizni sizning menga meni mening biz bizning ular ularning bu shu va lekin chunki uchun bilan emas " +
    "yo'q mayli rahmat iltimos kechirasiz nima nega qanday qachon qayer qayerda qaysi kim necha juda yaxshi yomon " +
    "keyin oldin hozir bugun ertaga kecha endi yana faqat hamma har bir ikki tushunmadim tushundim bilmayman " +
    "bilaman savol savolni javob qaytaring gapiring ayting deb degan edi ekan bo'ladi bo'lsa qilib qildim qilaman " +
    "ishlayman o'qiyman o'qituvchi talaba oila do'st shahar qishloq xo'sh xo'p albatta balki shunday ammo yoki agar esa " +
    "yaxshiman nimani marta yana-chi ingliz inglizcha o'zbek o'zbekcha tilida"
  ).split(" "),
);

/** Fallback when live captions carry no language code: flags answers given in Uzbek (or Russian). */
function guessLanguage(text: string): string | undefined {
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  if (letters < 3) return undefined;
  const cyrillic = text.match(/[Ѐ-ӿ]/g)?.length ?? 0;
  if (cyrillic / letters > 0.3) return /[ўқғҳ]/i.test(text) ? "uz" : "ru";
  const words = text.toLowerCase().replace(/[‘’ʻʼ`]/g, "'").match(/[a-z']+/g) ?? [];
  const uzbek = words.filter((w) => UZBEK_WORDS.has(w) || /[og]'[a-z]/.test(w) || /q(?!u)/.test(w)).length;
  return words.length && uzbek / words.length >= 0.3 ? "uz" : undefined;
}

class CloseError extends Error {
  constructor(readonly event: CloseEvent) {
    super(event.reason || `WebSocket closed (${event.code})`);
  }

  /** UI error code for a connection rejected during setup. */
  get code(): string {
    const reason = this.message.toLowerCase();
    if (/api key|permission|unauthenticated|auth/.test(reason)) return "auth";
    if (/quota|resource_exhausted|rate/.test(reason)) return "rate_limited";
    return "connect_failed";
  }
}

let entrySeq = 0;
const nextId = () => `e${Date.now().toString(36)}${(entrySeq++).toString(36)}`;

/** Identifies this test to the billing endpoints; reconnects keep reusing it. */
const newExamId = () => `x${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

/** Total tokens in a Live usage report. */
function usageTokens(usage: { totalTokenCount?: number } | undefined): number {
  const total = usage?.totalTokenCount;
  return typeof total === "number" && Number.isFinite(total) && total > 0 ? total : 0;
}

function parseDurationMs(value: string | undefined): number | null {
  const seconds = value ? parseFloat(value) : NaN;
  return Number.isFinite(seconds) ? seconds * 1000 : null;
}

/**
 * One live IELTS Speaking test with a Gemini Live examiner.
 * Framework-agnostic: React subscribes through `subscribe` / `getSnapshot`.
 */
export class ExamSession {
  info: LiveTokenResponse | null = null;
  readonly examId = newExamId();
  readonly finished: Promise<ExamResult>;
  /** Resolves once this test's token usage has been reported, so the meter can be refreshed. */
  readonly usageSettled: Promise<void>;

  private snapshot: ExamSnapshot = {
    status: "connecting",
    part: 0,
    entries: [],
    examinerSpeaking: false,
    micMuted: false,
    prep: null,
    talk: null,
    cueCardVisible: false,
    plan: null,
    startedAt: null,
    error: null,
  };
  private listeners = new Set<() => void>();
  private emitQueued = false;

  private ctx: AudioContext;
  private player: PcmPlayer;
  private recorder = new AnswerRecorder();
  private stream: MediaStream | null = null;
  private mic: MicCapture | null = null;

  private ai: GoogleGenAI | null = null;
  private session: Session | null = null;
  private connSeq = 0;
  private handle: string | null = null;
  private reconnecting = false;
  private goAwayPending = false;

  /** Current exchange: the candidate's answer followed by the examiner's reply. */
  private turn: { candidateId: string | null; examinerId: string | null } = { candidateId: null, examinerId: null };
  private modelTurnOpen = false;
  /** The examiner has produced speech in the current model turn. */
  private turnSpoke = false;
  private speechWaiters: (() => void)[] = [];
  private idleQueue: (() => void)[] = [];
  private awaitingTalkStart = false;
  private micGateUntil = 0;
  private lastCandidateSpeech = 0;
  private lastExaminerActivity = 0;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private shutdownStarted = false;
  private disposed = false;
  /**
   * The Live API reports usage as a running total for the connection, so the highest figure
   * seen is what this connection cost; a reconnect starts a fresh count that adds to it.
   */
  private liveTokens = 0;
  private connTokens = 0;
  private usageReported = false;
  private resolveUsageSettled!: () => void;
  private onPageHide: (() => void) | null = null;
  private resolveFinished!: (result: ExamResult) => void;
  private partialResult: ExamResult | null = null;

  constructor(
    readonly setup: ExamSetup,
    private lang: Lang,
  ) {
    // Created synchronously inside the click handler so that playback is allowed.
    this.ctx = createAudioContext();
    this.player = new PcmPlayer(this.ctx);
    this.player.onStart = () => {
      this.set({ examinerSpeaking: true });
      this.updateRecorder();
    };
    this.player.onDrain = () => {
      // A short tail so the end of the examiner's voice is not picked up by the microphone.
      this.micGateUntil = performance.now() + 150;
      this.set({ examinerSpeaking: false });
      this.updateRecorder();
      this.checkIdle();
    };
    this.finished = new Promise((resolve) => (this.resolveFinished = resolve));
    this.usageSettled = new Promise((resolve) => (this.resolveUsageSettled = resolve));
  }

  // ------------------------------------------------------------------ store

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;

  /** Live levels (0–1) for the visualiser; read on every animation frame. */
  levels() {
    return { examiner: this.player.level(), candidate: this.inputOpen() ? (this.mic?.level ?? 0) : 0 };
  }

  /** What was captured before a failure, so the test can still be evaluated. */
  get result(): ExamResult | null {
    return this.partialResult;
  }

  /** The candidate has answered (and gone quiet) but the examiner has not replied yet. */
  replyPending(quietMs = 1500): boolean {
    const sinceAnswer = Date.now() - this.lastCandidateSpeech;
    return (
      this.snapshot.status === "live" &&
      this.lastCandidateSpeech > this.lastExaminerActivity &&
      sinceAnswer > quietMs &&
      sinceAnswer < 30_000
    );
  }

  private set(patch: Partial<ExamSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    if (this.emitQueued) return;
    this.emitQueued = true;
    queueMicrotask(() => {
      this.emitQueued = false;
      for (const listener of this.listeners) listener();
    });
  }

  private get stopped() {
    return this.disposed || this.shutdownStarted;
  }

  // -------------------------------------------------------------- lifecycle

  async start() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
    } catch (error) {
      const name = (error as DOMException)?.name;
      this.fail(name === "NotAllowedError" || name === "SecurityError" ? "mic_denied" : "no_mic");
      return;
    }

    try {
      if (this.stopped) return this.releaseDevices();
      await this.fetchToken();
      // From here on the server holds tokens for this test, so a closing tab still reports back.
      this.onPageHide = () => this.reportUsage(true);
      window.addEventListener("pagehide", this.onPageHide);
      await this.createClient();

      if (this.stopped) return this.releaseDevices();
      this.mic = new MicCapture(this.ctx, this.stream);
      await this.mic.start();
      this.mic.onChunk = (pcm) => this.sendAudio(pcm);
      this.recorder.start(this.stream);

      if (this.stopped) return this.releaseDevices();
      await this.connect();
    } catch (error) {
      if (this.stopped) return;
      console.error("[exam] start failed", error);
      const message = error instanceof Error ? error.message : "";
      this.fail(
        error instanceof CloseError ? error.code : message.startsWith("token:") ? message.slice(6) : "connect_failed",
      );
      return;
    }

    if (this.stopped) {
      this.safeSend(() => this.session?.close());
      return;
    }
    this.set({ status: "live", startedAt: Date.now() });
    this.updateRecorder();
    this.later(() => void this.finish(), MODE_RULES[this.setup.mode].maxMinutes * 60_000);
    this.sendSignal(SIGNAL.start);
  }

  /** Ends the test (examiner's end_exam call or the End button) and resolves `finished`. */
  async finish() {
    if (this.shutdownStarted) return;
    this.set({ status: "ending" });
    const result = await this.shutdown();
    this.set({ status: "finished", examinerSpeaking: false, prep: null, talk: null });
    this.resolveFinished(result);
  }

  /** Releases everything without producing a result (component unmount). */
  dispose() {
    this.disposed = true;
    void this.shutdown();
  }

  setMuted(muted: boolean) {
    this.set({ micMuted: muted });
    if (muted) this.safeSend(() => this.session?.sendRealtimeInput({ audioStreamEnd: true }));
    this.updateRecorder();
  }

  /** Ends the Part 2 preparation minute (timer or "I'm ready"). */
  finishPreparation() {
    if (!this.snapshot.prep) return;
    this.set({ prep: null });
    this.updateRecorder();
    this.awaitingTalkStart = true;
    this.sendSignal(SIGNAL.prepOver);
  }

  // ------------------------------------------------------------- connection

  private async fetchToken() {
    const response = await fetch("/api/live/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...this.setup,
        examId: this.examId,
        lang: this.lang,
        localHour: new Date().getHours(),
        plan: this.info?.plan,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`token:${data.error ?? "token_failed"}`);
    this.info = data as LiveTokenResponse;
    this.set({ plan: this.info.summary });
  }

  private async createClient() {
    const { GoogleGenAI } = await import("@google/genai");
    this.ai = new GoogleGenAI({ apiKey: this.info!.token });
  }

  private async connect() {
    const ai = this.ai!;
    const info = this.info!;
    const id = ++this.connSeq;
    let ready = false;
    let rejectEarly: (error: Error) => void = () => {};
    const early = new Promise<never>((_, reject) => (rejectEarly = reject));
    const timeout = setTimeout(() => rejectEarly(new Error("setup timeout")), 15_000);

    // live.connect() resolves only after setupComplete, so a rejected setup must be caught via onclose.
    const connecting = ai.live.connect({
      model: info.model,
      config: { ...info.config, sessionResumption: this.handle ? { handle: this.handle } : {} },
      callbacks: {
        onmessage: (message) => {
          if (id === this.connSeq) this.onMessage(message);
        },
        onerror: (event) => console.warn("[exam] socket error", event),
        onclose: (event) => {
          if (!ready) rejectEarly(new CloseError(event));
          else if (id === this.connSeq) this.onUnexpectedClose(event);
        },
      },
    });

    try {
      const session = await Promise.race([connecting, early]);
      ready = true;
      const previous = this.session;
      this.session = session;
      if (previous) {
        this.safeSend(() => previous.close());
        // The replaced connection is done counting; the new one starts from zero.
        this.liveTokens += this.connTokens;
        this.connTokens = 0;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  private onUnexpectedClose(event: CloseEvent) {
    if (this.stopped) return;
    console.warn("[exam] connection closed", event.code, event.reason);
    this.player.interrupt();
    void this.reconnect();
  }

  /** The server rotates connections roughly every 10 minutes; move over between turns. */
  private onGoAway(timeLeft: string | undefined) {
    if (this.goAwayPending) return;
    this.goAwayPending = true;
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      this.goAwayPending = false;
      void this.reconnect();
    };
    this.whenIdle(go);
    this.later(go, Math.max(0, (parseDurationMs(timeLeft) ?? 10_000) - 1500));
  }

  private async reconnect() {
    if (this.reconnecting || this.stopped) return;
    if (!this.handle) return this.fail("connection_lost");
    this.reconnecting = true;
    this.set({ status: "reconnecting" });
    for (let attempt = 0; attempt < MAX_RECONNECTS && !this.stopped; attempt++) {
      try {
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, 700 * attempt));
          await this.fetchToken();
          await this.createClient();
        }
        await this.connect();
        this.reconnecting = false;
        this.turn = { candidateId: null, examinerId: null };
        this.modelTurnOpen = false;
        this.turnSpoke = false;
        this.set({ status: "live" });
        this.updateRecorder();
        this.checkIdle();
        return;
      } catch (error) {
        console.warn(`[exam] reconnect attempt ${attempt + 1} failed`, error);
      }
    }
    this.reconnecting = false;
    this.fail("connection_lost");
  }

  // --------------------------------------------------------------- messages

  private onMessage(message: LiveServerMessage) {
    this.connTokens = Math.max(this.connTokens, usageTokens(message.usageMetadata));
    const resumption = message.sessionResumptionUpdate;
    if (resumption?.resumable && resumption.newHandle) this.handle = resumption.newHandle;
    if (message.goAway) this.onGoAway(message.goAway.timeLeft);
    if (message.toolCall?.functionCalls?.length) this.onToolCalls(message.toolCall.functionCalls);

    const content = message.serverContent;
    if (!content) return;

    if (content.interrupted) {
      this.player.interrupt();
      this.closeLiveEntries(true);
      this.modelTurnOpen = false;
      this.turn = { candidateId: null, examinerId: null };
    }

    if (content.inputTranscription?.text) {
      this.onCandidateText(content.inputTranscription.text, content.inputTranscription.languageCode);
    }

    for (const part of content.modelTurn?.parts ?? []) {
      const data = part.inlineData;
      if (data?.data && data.mimeType?.startsWith("audio/")) {
        this.onExaminerActivity();
        const rate = Number(/rate=(\d+)/.exec(data.mimeType)?.[1]) || 24000;
        this.player.enqueue(data.data, rate);
      }
    }

    if (content.outputTranscription?.text) this.onExaminerText(content.outputTranscription.text);
    if (content.turnComplete) this.onTurnComplete();
  }

  private onCandidateText(text: string, languageCode?: string) {
    this.lastCandidateSpeech = Date.now();
    const entries = [...this.snapshot.entries];
    let index = entries.findIndex((e) => e.id === this.turn.candidateId);
    if (index === -1) {
      const entry: LiveEntry = { id: nextId(), role: "candidate", text: "", part: this.snapshot.part, live: true };
      // Captions can arrive after the examiner has already started replying.
      const examinerIndex = entries.findIndex((e) => e.id === this.turn.examinerId);
      index = examinerIndex === -1 ? entries.length : examinerIndex;
      entries.splice(index, 0, entry);
      this.turn.candidateId = entry.id;
    }
    const current = entries[index];
    const updated = appendChunk(current.text, text);
    const lang = languageCode && !languageCode.toLowerCase().startsWith("en") ? languageCode : guessLanguage(updated);
    entries[index] = { ...current, text: updated, lang };
    this.set({ entries });
  }

  private onExaminerActivity() {
    this.modelTurnOpen = true;
    this.turnSpoke = true;
    this.lastExaminerActivity = Date.now();
    const waiters = this.speechWaiters;
    this.speechWaiters = [];
    for (const resolve of waiters) resolve();
    const talk = this.snapshot.talk;
    // The examiner speaking well into the long turn means the candidate has finished.
    if (talk && Date.now() - talk.startedAt > 10_000) this.set({ talk: null });
  }

  /** Resolves when the examiner starts speaking again (or after `maxMs`). */
  private nextExaminerSpeech(maxMs: number): Promise<void> {
    return new Promise((resolve) => {
      this.speechWaiters.push(resolve);
      this.later(resolve, maxMs);
    });
  }

  private onExaminerText(text: string) {
    this.onExaminerActivity();
    const entries = [...this.snapshot.entries];
    let index = entries.findIndex((e) => e.id === this.turn.examinerId);
    if (index === -1) {
      entries.push({ id: nextId(), role: "examiner", text: "", part: this.snapshot.part, live: true });
      index = entries.length - 1;
      this.turn.examinerId = entries[index].id;
    }
    const updated = appendChunk(entries[index].text, text);
    entries[index] = { ...entries[index], text: updated };
    this.set({ entries });
    this.inferPart(updated);
  }

  /** Fallback in case the model forgets to call set_exam_part. */
  private inferPart(text: string) {
    const t = text.toLowerCase();
    if (this.snapshot.part < 1 && t.includes("in this first part")) this.setPart(1);
    else if (this.snapshot.part < 2 && t.includes("give you a topic")) this.setPart(2);
    else if (this.snapshot.part < 3 && /been talking about/.test(t)) this.setPart(3);
  }

  private closeLiveEntries(interrupted = false) {
    const examinerId = this.turn.examinerId;
    const entries = this.snapshot.entries.map((e) =>
      e.live ? { ...e, live: false, interrupted: e.interrupted || (interrupted && e.id === examinerId) } : e,
    );
    this.set({ entries });
  }

  private onTurnComplete() {
    this.closeLiveEntries();
    this.modelTurnOpen = false;
    this.turn = { candidateId: null, examinerId: null };
    // The first spoken turn after [PREP_TIME_OVER] is "…start speaking now, please".
    if (this.awaitingTalkStart && this.turnSpoke) {
      this.awaitingTalkStart = false;
      this.whenIdle(() => this.startTalk());
    }
    this.turnSpoke = false;
    this.checkIdle();
  }

  // ------------------------------------------------------------------ tools

  /**
   * The model often calls a tool first and waits for the result before speaking. If it has not
   * spoken yet in this turn, WHEN_IDLE lets it continue; if it already has, SILENT avoids a
   * second, duplicated turn.
   */
  private onToolCalls(calls: FunctionCall[]) {
    const spoke = this.turnSpoke;
    const afterSpeech = (fn: () => void) =>
      void (spoke ? Promise.resolve() : this.nextExaminerSpeech(6000)).then(() => this.whenIdle(fn));

    const responses: FunctionResponse[] = [];
    for (const call of calls) {
      if (call.name === "set_exam_part") {
        const part = Number(call.args?.part);
        if (part === 1 || part === 2 || part === 3) this.setPart(part);
      } else if (call.name === "start_preparation_time") {
        this.setPart(2);
        this.set({ cueCardVisible: true });
        // Start the countdown once the examiner has finished reading the card aloud.
        this.modelTurnOpen = true;
        afterSpeech(() => this.startPreparation());
      } else if (call.name === "end_exam") {
        // Let the closing line play out before ending.
        this.modelTurnOpen = true;
        afterSpeech(() => this.later(() => void this.finish(), 400));
      }
      responses.push({ id: call.id, name: call.name, response: { result: "ok" }, scheduling: spoke ? SILENT : WHEN_IDLE });
    }
    this.safeSend(() => this.session?.sendToolResponse({ functionResponses: responses }));
  }

  private setPart(part: ExamPart) {
    if (part <= this.snapshot.part) return;
    const divider: LiveEntry = { id: nextId(), role: "divider", text: "", part };
    const entries = [...this.snapshot.entries];
    // Keep the examiner's current sentence under the new heading.
    const liveIndex = entries.findIndex((e) => e.id === this.turn.examinerId);
    if (liveIndex === -1) entries.push(divider);
    else {
      entries.splice(liveIndex, 0, divider);
      entries[liveIndex + 1] = { ...entries[liveIndex + 1], part };
    }
    this.set({ part, entries });
  }

  private startPreparation() {
    if (this.snapshot.prep || this.stopped) return;
    const total = this.info?.prepSeconds ?? 60;
    this.set({ prep: { endsAt: Date.now() + total * 1000, total }, cueCardVisible: true });
    this.safeSend(() => this.session?.sendRealtimeInput({ audioStreamEnd: true }));
    this.updateRecorder();
    this.later(() => this.finishPreparation(), total * 1000);
  }

  private startTalk() {
    if (this.stopped) return;
    const total = this.info?.talkSeconds ?? 120;
    const startedAt = Date.now();
    this.set({ talk: { startedAt, total } });
    this.later(() => {
      if (this.snapshot.talk?.startedAt !== startedAt) return;
      this.set({ talk: null });
      const stillTalking = Date.now() - this.lastCandidateSpeech < 4000;
      if (stillTalking && !this.modelTurnOpen && !this.player.playing) this.sendSignal(SIGNAL.timeUp);
    }, total * 1000);
  }

  /** Runs `fn` once the examiner has finished its turn and its audio has played out. */
  private whenIdle(fn: () => void, maxWaitMs = 8000) {
    this.idleQueue.push(fn);
    this.later(() => {
      const index = this.idleQueue.indexOf(fn);
      if (index !== -1 && !this.player.playing) {
        this.idleQueue.splice(index, 1);
        fn();
      }
    }, maxWaitMs);
    this.checkIdle();
  }

  private checkIdle() {
    if (this.modelTurnOpen || this.player.playing || this.idleQueue.length === 0) return;
    const queued = this.idleQueue;
    this.idleQueue = [];
    for (const fn of queued) fn();
  }

  // ------------------------------------------------------------------ audio

  /** Half-duplex: the microphone is closed while the examiner talks, which prevents echo barge-ins on speakers. */
  private inputOpen() {
    const s = this.snapshot;
    return s.status === "live" && !s.micMuted && !s.prep && !this.player.playing && performance.now() > this.micGateUntil;
  }

  private sendAudio(pcm: ArrayBuffer) {
    if (!this.session || this.reconnecting || !this.inputOpen()) return;
    const data = base64FromBuffer(pcm);
    this.safeSend(() => this.session?.sendRealtimeInput({ audio: { data, mimeType: "audio/pcm;rate=16000" } }));
  }

  private updateRecorder() {
    const s = this.snapshot;
    this.recorder.setActive(s.status === "live" && !s.micMuted && !s.prep && !s.examinerSpeaking);
  }

  // ---------------------------------------------------------------- helpers

  private sendSignal(text: string) {
    this.safeSend(() => this.session?.sendClientContent({ turns: [{ role: "user", parts: [{ text }] }], turnComplete: true }));
  }

  private safeSend(send: () => void) {
    try {
      send();
    } catch (error) {
      console.warn("[exam] send failed", error);
    }
  }

  /**
   * Tells the server what this test really cost, so the tokens held when the session token was
   * issued can be settled. Sent once, with a beacon when the tab is going away. The server only
   * treats the figure as a refinement — it clamps it against the session's real duration — so a
   * report that never arrives is charged at the reserved amount instead.
   */
  private reportUsage(unloading = false) {
    if (this.usageReported) return;
    this.usageReported = true;
    // No session token means no reservation was ever taken, so there is nothing to settle.
    if (!this.info) return this.resolveUsageSettled();
    if (this.onPageHide) {
      window.removeEventListener("pagehide", this.onPageHide);
      this.onPageHide = null;
    }
    const tokens = this.liveTokens + this.connTokens;
    const body = JSON.stringify({ examId: this.examId, tokens: tokens || null });
    if (unloading && navigator.sendBeacon?.("/api/exam/usage", new Blob([body], { type: "text/plain;charset=UTF-8" }))) {
      return this.resolveUsageSettled();
    }
    void fetch("/api/exam/usage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    })
      .catch(() => {
        // The reservation covers it: nothing is lost by a failed report.
      })
      .finally(() => this.resolveUsageSettled());
  }

  private later(fn: () => void, ms: number) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (!this.disposed) fn();
    }, ms);
    this.timers.add(timer);
  }

  private fail(code: string) {
    if (this.shutdownStarted) return;
    this.set({ status: "error", error: code });
    void this.shutdown().then(() => {
      this.set({ status: "error", error: code, examinerSpeaking: false, prep: null, talk: null });
    });
  }

  private releaseDevices() {
    this.mic?.stop();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }

  private async shutdown(): Promise<ExamResult> {
    if (this.shutdownStarted) return this.partialResult ?? { transcript: [], audio: null, durationSec: 0, candidateSpeechSec: 0 };
    this.shutdownStarted = true;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.idleQueue = [];

    const audio = await this.recorder.stop();
    const candidateSpeechSec = this.recorder.activeSeconds;
    this.connSeq++;
    this.safeSend(() => this.session?.close());
    this.session = null;
    this.reportUsage();
    this.player.interrupt();
    this.releaseDevices();
    void this.ctx.close().catch(() => {});

    const transcript: TranscriptEntry[] = this.snapshot.entries
      .filter((e) => e.role === "divider" || e.text.trim())
      .map((e) => ({
        id: e.id,
        role: e.role,
        part: e.part,
        text: e.text.replace(/\s+/g, " ").trim(),
        ...(e.lang ? { lang: e.lang } : {}),
        ...(e.interrupted ? { interrupted: true } : {}),
      }));
    const startedAt = this.snapshot.startedAt;
    this.partialResult = {
      transcript,
      audio,
      durationSec: startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0,
      candidateSpeechSec: Math.round(candidateSpeechSec),
    };
    return this.partialResult;
  }
}

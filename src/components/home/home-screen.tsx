"use client";

import { CircleAlert, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ExamSetup, Lang, SessionRecord } from "@/lib/exam/types";
import { useI18n } from "@/lib/i18n";
import type { DictKey } from "@/lib/i18n-dict";
import { ExamSession, type ExamResult } from "@/lib/live/exam-session";
import { sessionStore } from "@/lib/storage";
import { countWords } from "@/lib/utils";
import { DEFAULT_VOICE_ID, getVoice, isAccent } from "@/lib/voices";
import { NEW_TEST_EVENT, useExamGuard } from "../exam-guard";
import { ExamScreen } from "../exam/exam-screen";
import { EvaluatingScreen } from "./evaluating-screen";
import { SetupScreen } from "./setup-screen";

const SETUP_KEY = "janob-ielts:setup";
const DEFAULT_SETUP: ExamSetup = { voice: DEFAULT_VOICE_ID, accent: "british", mode: "full" };

type Stage =
  | { kind: "setup" }
  | { kind: "exam"; session: ExamSession }
  | { kind: "evaluating" }
  | { kind: "failed"; code: string; retry: () => void };

function subscribeStorage(listener: () => void) {
  window.addEventListener("storage", listener);
  return () => window.removeEventListener("storage", listener);
}

function readStoredSetup(): string | null {
  try {
    return localStorage.getItem(SETUP_KEY);
  } catch {
    return null;
  }
}

/** Last used examiner/format/accent, restored after hydration. */
function useStoredSetup(): Partial<ExamSetup> {
  const raw = useSyncExternalStore(subscribeStorage, readStoredSetup, () => null);
  return useMemo(() => {
    try {
      const value = JSON.parse(raw ?? "{}") as Partial<ExamSetup>;
      return {
        ...(getVoice(value.voice) ? { voice: value.voice } : {}),
        ...(isAccent(value.accent) ? { accent: value.accent } : {}),
        ...(value.mode === "full" || value.mode === "quick" ? { mode: value.mode } : {}),
      };
    } catch {
      return {};
    }
  }, [raw]);
}

function currentLang(): Lang {
  return document.documentElement.lang === "en" ? "en" : "uz";
}

function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function fileName(type: string): string {
  if (type.includes("mp4")) return "answers.m4a";
  if (type.includes("ogg")) return "answers.ogg";
  return "answers.webm";
}

class EvaluationError extends Error {}

/** Uploads the recording + transcript, returns the stored history record. */
async function submitForEvaluation(result: ExamResult, session: ExamSession): Promise<SessionRecord> {
  const voice = getVoice(session.setup.voice)!;
  const cueCardTitle = session.getSnapshot().part >= 2 ? session.info?.summary.cueCard.title : undefined;
  const form = new FormData();
  if (result.audio) form.append("audio", result.audio, fileName(result.audio.type));
  form.append(
    "meta",
    JSON.stringify({
      setup: session.setup,
      transcript: result.transcript,
      cueCardTitle,
      durationSec: result.durationSec,
      candidateSpeechSec: result.candidateSpeechSec,
      feedbackLang: currentLang(),
    }),
  );

  const response = await fetch("/api/evaluate", { method: "POST", body: form });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.evaluation) throw new EvaluationError(data.error ?? "eval_failed");

  const record: SessionRecord = {
    id: newId(),
    createdAt: Date.now(),
    setup: session.setup,
    examinerName: voice.name,
    durationSec: result.durationSec,
    candidateSpeechSec: result.candidateSpeechSec,
    cueCardTitle,
    transcript: result.transcript,
    verbatim: data.verbatim ?? null,
    evaluation: data.evaluation,
  };
  sessionStore.add(record);
  return record;
}

function candidateWords(result: ExamResult): number {
  return result.transcript
    .filter((e) => e.role === "candidate")
    .reduce((sum, e) => sum + countWords(e.text), 0);
}

export function HomeScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const guard = useExamGuard();
  const stored = useStoredSetup();
  const [override, setOverride] = useState<Partial<ExamSetup>>({});
  const setup: ExamSetup = { ...DEFAULT_SETUP, ...stored, ...override };
  const [stage, setStage] = useState<Stage>({ kind: "setup" });
  const sessionRef = useRef<ExamSession | null>(null);

  const disposeSession = useCallback(() => {
    sessionRef.current?.dispose();
    sessionRef.current = null;
  }, []);

  // Release the microphone and the connection when leaving the page.
  useEffect(() => disposeSession, [disposeSession]);

  useEffect(() => {
    const reset = () => {
      disposeSession();
      setStage({ kind: "setup" });
    };
    window.addEventListener(NEW_TEST_EVENT, reset);
    return () => window.removeEventListener(NEW_TEST_EVENT, reset);
  }, [disposeSession]);

  const evaluate = async (result: ExamResult, session: ExamSession) => {
    guard.setActive(false);
    if (candidateWords(result) < 12) {
      setStage({ kind: "failed", code: "no_speech", retry: () => start(session.setup) });
      return;
    }
    setStage({ kind: "evaluating" });
    try {
      const record = await submitForEvaluation(result, session);
      sessionRef.current = null;
      router.push(`/s/${record.id}`);
    } catch (error) {
      const code = error instanceof EvaluationError ? error.message : "eval_failed";
      setStage({ kind: "failed", code, retry: () => void evaluate(result, session) });
    }
  };

  const start = (examSetup: ExamSetup) => {
    disposeSession();
    try {
      localStorage.setItem(SETUP_KEY, JSON.stringify(examSetup));
    } catch {
      // not persisted, that's fine
    }
    // Must run synchronously in the click handler: it unlocks audio playback.
    const session = new ExamSession(examSetup, currentLang());
    sessionRef.current = session;
    guard.setActive(true);
    setStage({ kind: "exam", session });
    void session.start();
    void session.finished.then((result) => {
      if (sessionRef.current === session) void evaluate(result, session);
    });
  };

  const exit = () => {
    disposeSession();
    guard.setActive(false);
    setStage({ kind: "setup" });
  };

  if (stage.kind === "exam") {
    const session = stage.session;
    return (
      <ExamScreen
        session={session}
        onRetry={() => start(session.setup)}
        onEvaluatePartial={() => session.result && void evaluate(session.result, session)}
        onExit={exit}
      />
    );
  }

  if (stage.kind === "evaluating") return <EvaluatingScreen />;

  if (stage.kind === "failed") {
    const key = `err_${stage.code}` as DictKey;
    return (
      <div className="flex h-full items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-line bg-elevated p-6 shadow-soft animate-fade-up">
          <CircleAlert className="size-6 text-danger" />
          <h1 className="mt-3 text-lg font-semibold">{t("errorTitle")}</h1>
          <p className="mt-1.5 text-sm leading-6 text-fg-muted">{t(key) === key ? t("err_eval_failed") : t(key)}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={stage.retry}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-fg"
            >
              <RotateCcw className="size-3.5" />
              {t("tryAgain")}
            </button>
            <button type="button" onClick={exit} className="rounded-full px-4 py-2 text-sm text-fg-muted hover:text-fg">
              {t("backHome")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <SetupScreen
      setup={setup}
      onChange={(patch) => setOverride((current) => ({ ...current, ...patch }))}
      onStart={() => start(setup)}
    />
  );
}

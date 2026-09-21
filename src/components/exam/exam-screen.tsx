"use client";

import { CircleAlert, Mic, MicOff, PhoneOff, RotateCcw } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import type { ExamPart } from "@/lib/exam/types";
import { useI18n } from "@/lib/i18n";
import type { DictKey } from "@/lib/i18n-dict";
import type { ExamSession } from "@/lib/live/exam-session";
import { cn, countWords, formatClock } from "@/lib/utils";
import { getVoice, VOICES } from "@/lib/voices";
import { ExaminerAvatar, Spinner } from "../ui/primitives";
import { CueCardPanel } from "./cue-card";
import { useCandidateActivity, useNow } from "./hooks";
import { Orb, type OrbState } from "./orb";
import { Transcript } from "./transcript";

const PARTS: ExamPart[] = [0, 1, 2, 3];

export function ExamScreen({
  session,
  onRetry,
  onEvaluatePartial,
  onExit,
}: {
  session: ExamSession;
  onRetry: () => void;
  onEvaluatePartial: () => void;
  onExit: () => void;
}) {
  const { t } = useI18n();
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const voice = getVoice(session.setup.voice) ?? VOICES[0];
  const candidate = useCandidateActivity(session);
  const now = useNow(1000, snap.status === "live" || snap.status === "reconnecting");

  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [snap.entries, snap.cueCardVisible]);

  const busy = snap.status === "ending" || snap.status === "finished";
  const elapsed = snap.startedAt ? (now - snap.startedAt) / 1000 : 0;

  const orbState: OrbState = (() => {
    if (snap.status !== "live") return "idle";
    if (snap.prep) return "prep";
    if (snap.examinerSpeaking) return "examiner";
    if (snap.micMuted) return "idle";
    return candidate.speaking ? "candidate" : "listening";
  })();

  const status = (() => {
    if (snap.status === "connecting") return t("connecting");
    if (snap.status === "reconnecting") return t("reconnecting");
    if (busy) return t("finishing");
    if (snap.prep) return t("preparing");
    if (snap.examinerSpeaking) return t("examinerSpeaking", { name: voice.name });
    if (snap.micMuted) return t("micOff");
    if (candidate.speaking) return t("youSpeaking");
    return candidate.waiting ? t("examinerThinking", { name: voice.name }) : t("listening");
  })();

  const end = () => {
    if (window.confirm(t("endConfirm"))) void session.finish();
  };

  const partialWords = (session.result?.transcript ?? [])
    .filter((e) => e.role === "candidate")
    .reduce((sum, e) => sum + countWords(e.text), 0);

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <ExaminerAvatar voice={voice} size={30} />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-medium">{voice.name}</div>
            <div className="truncate text-xs text-fg-muted">{t(`part${snap.part}` as DictKey)}</div>
          </div>
        </div>
        <ol className="hidden items-center gap-1 sm:flex" aria-label="Progress">
          {PARTS.map((p) => (
            <li
              key={p}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs transition-colors",
                p === snap.part ? "bg-primary font-medium text-primary-fg" : p < snap.part ? "text-fg-muted" : "text-fg-subtle",
              )}
            >
              {t(`partShort${p}` as DictKey)}
            </li>
          ))}
        </ol>
        <div className="flex flex-1 items-center justify-end gap-3">
          <span className="font-mono text-sm tabular-nums text-fg-muted">{formatClock(elapsed)}</span>
        </div>
      </header>

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        }}
        className="scrollbar-thin min-h-0 flex-1 overflow-y-auto"
      >
        <div className="mx-auto w-full max-w-3xl px-4 py-8">
          {snap.status === "connecting" && snap.entries.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-24 text-center animate-fade-up">
              <Spinner className="size-5 text-fg-muted" />
              <p className="text-[15px] font-medium">{t("connecting")}</p>
              <p className="text-sm text-fg-muted">{t("connectingSub")}</p>
            </div>
          )}
          <Transcript entries={snap.entries} voice={voice} />
          {snap.status === "error" && (
            <div className="mt-8 rounded-2xl border border-danger/30 bg-danger-soft p-5 animate-fade-up">
              <div className="flex items-start gap-3">
                <CircleAlert className="mt-0.5 size-5 shrink-0 text-danger" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{t("errorTitle")}</p>
                  <p className="mt-1 text-sm text-fg-muted">{t(`err_${snap.error ?? "connect_failed"}` as DictKey)}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={onRetry}
                      className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-fg"
                    >
                      <RotateCcw className="size-3.5" />
                      {t("tryAgain")}
                    </button>
                    {partialWords >= 25 && (
                      <button
                        type="button"
                        onClick={onEvaluatePartial}
                        className="rounded-full border border-line-strong bg-elevated px-4 py-2 text-sm font-medium"
                      >
                        {t("evaluateAnyway")}
                      </button>
                    )}
                    <button type="button" onClick={onExit} className="rounded-full px-4 py-2 text-sm text-fg-muted hover:text-fg">
                      {t("backHome")}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {snap.cueCardVisible && snap.plan && snap.part === 2 && (
        <CueCardPanel card={snap.plan.cueCard} prep={snap.prep} talk={snap.talk} onReady={() => session.finishPreparation()} />
      )}

      {snap.status !== "error" && (
        <div className="shrink-0 px-4 pb-5 pt-2">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-3 rounded-[28px] border border-line bg-elevated px-3 py-2 shadow-soft">
            <button
              type="button"
              onClick={() => session.setMuted(!snap.micMuted)}
              disabled={snap.status !== "live" || Boolean(snap.prep)}
              aria-label={t(snap.micMuted ? "unmute" : "mute")}
              title={t(snap.micMuted ? "unmute" : "mute")}
              className={cn(
                "inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40",
                snap.micMuted ? "bg-danger-soft text-danger" : "bg-muted text-fg hover:bg-hover",
              )}
            >
              {snap.micMuted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
            </button>

            <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
              <Orb session={session} state={orbState} size={40} />
              <span className="truncate text-sm text-fg-muted" aria-live="polite">
                {status}
              </span>
            </div>

            <button
              type="button"
              onClick={end}
              disabled={busy || snap.status === "connecting"}
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-danger-soft px-4 text-sm font-medium text-danger transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {busy ? <Spinner /> : <PhoneOff className="size-4" />}
              <span className="hidden sm:inline">{t("endTest")}</span>
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] text-fg-subtle">{t("headphonesTip")}</p>
        </div>
      )}
    </div>
  );
}

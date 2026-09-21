"use client";

import {
  ArrowRight,
  AudioLines,
  ChevronDown,
  Clock,
  GraduationCap,
  Languages,
  ListChecks,
  Mic,
  Pause,
  Sparkles,
  SpellCheck,
  Target,
  ThumbsUp,
  TriangleAlert,
  Volume2,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { bandLevel, CRITERIA, formatBand } from "@/lib/exam/scoring";
import type { SessionRecord } from "@/lib/exam/types";
import { useI18n } from "@/lib/i18n";
import type { DictKey } from "@/lib/i18n-dict";
import { useSession } from "@/lib/storage";
import { cn, formatClock, formatDate } from "@/lib/utils";
import { getVoice, VOICES } from "@/lib/voices";
import { NEW_TEST_EVENT } from "../exam-guard";
import { Transcript } from "../exam/transcript";
import { ExaminerAvatar, SectionTitle, Spinner } from "../ui/primitives";
import { useSpeechPlayer } from "../ui/use-speech";

function BandRing({ band }: { band: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative grid size-[148px] shrink-0 place-items-center">
      <svg viewBox="0 0 128 128" className="absolute inset-0 -rotate-90">
        <circle cx="64" cy="64" r={radius} fill="none" strokeWidth="7" className="stroke-muted" />
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - band / 9)}
          className="stroke-accent"
        />
      </svg>
      <span className="font-serif text-[56px] leading-none tracking-tight">{formatBand(band)}</span>
    </div>
  );
}

function Segments({ band }: { band: number }) {
  return (
    <div className="flex gap-1" aria-hidden>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={cn("h-1.5 flex-1 rounded-full", i < band ? "bg-accent" : "bg-muted")} />
      ))}
    </div>
  );
}

function ListCard({
  title,
  items,
  icon,
  tone,
}: {
  title: string;
  items: string[];
  icon: React.ReactNode;
  tone: "accent" | "warn";
}) {
  if (!items.length) return null;
  return (
    <div className="rounded-2xl border border-line bg-elevated p-5">
      <h3 className={cn("flex items-center gap-2 text-sm font-semibold", tone === "accent" ? "text-accent" : "text-warn")}>
        {icon}
        {title}
      </h3>
      <ul className="mt-3 space-y-2.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2.5 text-sm leading-6">
            <span className={cn("mt-2.5 size-1.5 shrink-0 rounded-full", tone === "accent" ? "bg-accent" : "bg-warn")} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ResultScreen({ id }: { id: string }) {
  const { t } = useI18n();
  const record = useSession(id);

  if (record === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-5 text-fg-muted" />
      </div>
    );
  }

  if (record === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="max-w-sm text-sm leading-6 text-fg-muted">{t("resultNotFound")}</p>
        <Link href="/" className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-fg">
          {t("newTest")}
        </Link>
      </div>
    );
  }

  return <Result record={record} />;
}

function Result({ record }: { record: SessionRecord }) {
  const { t, lang } = useI18n();
  const speech = useSpeechPlayer();
  const [showTranscript, setShowTranscript] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const voice = getVoice(record.setup.voice) ?? VOICES[0];
  const e = record.evaluation;

  const listen = (key: string, text: string) => {
    if (speech.playingKey === key || speech.loadingKey === key) return speech.stop();
    setSpeechError(null);
    speech
      .play(key, () =>
        fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice: voice.id, accent: record.setup.accent }),
        }),
      )
      .catch(() => setSpeechError(key));
  };

  const models = [e.models.live, e.models.transcribe, e.models.evaluator].filter(Boolean).join(" · ");

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <article className="mx-auto w-full max-w-3xl space-y-10 px-4 py-10 sm:px-6">
        <header className="flex flex-col items-center gap-6 text-center animate-fade-up sm:flex-row sm:text-left">
          <BandRing band={e.overall} />
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-[0.1em] text-fg-subtle">{t("estimatedBand")}</div>
            <h1 className="mt-1.5 font-serif text-4xl tracking-tight sm:text-[44px]">
              {t(`bandLevel${bandLevel(e.overall)}` as DictKey)}
            </h1>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[13px] text-fg-muted sm:justify-start">
              <span className="inline-flex items-center gap-1.5">
                <ExaminerAvatar voice={voice} size={18} />
                {record.examinerName}
              </span>
              <span>{t(record.setup.mode === "full" ? "modeFull" : "modeQuick")}</span>
              <span>{formatDate(record.createdAt, lang)}</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" />
                {formatClock(record.durationSec)}
              </span>
              <span className="inline-flex items-center gap-1" title={t("speakingTimeStat")}>
                <Mic className="size-3.5" />
                {formatClock(record.candidateSpeechSec)}
              </span>
            </div>
          </div>
        </header>

        {!e.sampleSufficient && (
          <div className="flex gap-3 rounded-2xl border border-warn/30 bg-warn-soft p-4 text-sm leading-6">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
            {t("sampleShort")}
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-2">
          {CRITERIA.map((key) => (
            <div key={key} className="rounded-2xl border border-line bg-elevated p-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-medium leading-5 text-fg-muted">{t(`crit_${key}` as DictKey)}</h3>
                <span className="font-serif text-[34px] leading-none">{e.criteria[key].band}</span>
              </div>
              <div className="mt-3">
                <Segments band={e.criteria[key].band} />
              </div>
              <p className="mt-3.5 text-sm leading-6">{e.criteria[key].comment}</p>
            </div>
          ))}
        </section>

        {e.summary && (
          <section>
            <SectionTitle>{t("summary")}</SectionTitle>
            <p className="text-[15.5px] leading-7 text-pretty">{e.summary}</p>
          </section>
        )}

        {(e.strengths.length > 0 || e.improvements.length > 0) && (
          <section className="grid gap-3 sm:grid-cols-2">
            <ListCard title={t("strengths")} items={e.strengths} icon={<ThumbsUp className="size-4" />} tone="accent" />
            <ListCard title={t("improvements")} items={e.improvements} icon={<Target className="size-4" />} tone="warn" />
          </section>
        )}

        {e.corrections.length > 0 && (
          <section>
            <SectionTitle icon={<SpellCheck className="size-4" />}>{t("corrections")}</SectionTitle>
            <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-elevated">
              {e.corrections.map((c, i) => (
                <div key={i} className="grid gap-1.5 p-4 text-sm leading-6 sm:grid-cols-[88px_1fr] sm:gap-x-4">
                  <span className="text-xs leading-6 text-fg-subtle">{t("youSaid")}</span>
                  <span className="text-fg-muted line-through decoration-danger/60">{c.original}</span>
                  <span className="text-xs leading-6 text-fg-subtle">{t("better")}</span>
                  <span className="font-medium">{c.corrected}</span>
                  <span className="hidden sm:block" />
                  <span className="text-[13px] text-fg-muted">{c.explanation}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {e.vocabulary.length > 0 && (
          <section>
            <SectionTitle icon={<Sparkles className="size-4" />}>{t("vocabulary")}</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2">
              {e.vocabulary.map((v, i) => (
                <div key={i} className="rounded-2xl border border-line bg-elevated p-4">
                  <p className="text-sm">
                    <span className="text-fg-muted">{t("insteadOf")}</span> <span className="font-medium">“{v.used}”</span>{" "}
                    <span className="text-fg-muted">{t("tryThese")}:</span>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {v.alternatives.map((a) => (
                      <span key={a} className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[13px] font-medium text-accent">
                        {a}
                      </span>
                    ))}
                  </div>
                  {v.example && <p className="mt-2.5 text-[13px] italic leading-5 text-fg-muted">{v.example}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        {e.nativeLanguage.length > 0 && (
          <section>
            <SectionTitle icon={<Languages className="size-4" />} sub={t("nativeWordsSub")}>
              {t("nativeWords")}
            </SectionTitle>
            <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-elevated">
              {e.nativeLanguage.map((n, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <span className="min-w-0 flex-1 text-fg-muted">{n.said}</span>
                  <ArrowRight className="size-3.5 shrink-0 text-fg-subtle" />
                  <span className="min-w-0 flex-1 font-medium">{n.english}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {e.pronunciation.length > 0 && (
          <section>
            <SectionTitle icon={<AudioLines className="size-4" />}>{t("pronunciationTips")}</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2">
              {e.pronunciation.map((p, i) => (
                <div key={i} className="rounded-2xl border border-line bg-elevated p-4">
                  <p className="font-medium">{p.word}</p>
                  <p className="mt-1 text-sm leading-6 text-fg-muted">{p.issue}</p>
                  <p className="mt-2 text-sm leading-6">{p.tip}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {e.studyPlan.length > 0 && (
          <section>
            <SectionTitle icon={<ListChecks className="size-4" />}>{t("studyPlan")}</SectionTitle>
            <ol className="space-y-3">
              {e.studyPlan.map((step, i) => (
                <li key={i} className="flex gap-3.5 rounded-2xl border border-line bg-elevated p-4">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-fg">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-6">{step.title}</p>
                    <p className="mt-0.5 text-sm leading-6 text-fg-muted">{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {e.modelAnswers.length > 0 && (
          <section>
            <SectionTitle icon={<GraduationCap className="size-4" />} sub={t("modelAnswersSub")}>
              {t("modelAnswers")}
            </SectionTitle>
            <div className="space-y-3">
              {e.modelAnswers.map((m, i) => {
                const key = `answer-${i}`;
                const playing = speech.playingKey === key;
                const loading = speech.loadingKey === key;
                return (
                  <div key={key} className="rounded-2xl border border-line bg-elevated p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-fg-subtle">{t(`partShort${m.part}` as DictKey)}</div>
                        <p className="mt-0.5 font-medium leading-6">{m.question}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => listen(key, m.answer)}
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                          playing ? "border-accent bg-accent text-accent-fg" : "border-line hover:border-line-strong",
                        )}
                      >
                        {loading ? <Spinner className="size-3.5" /> : playing ? <Pause className="size-3.5" /> : <Volume2 className="size-3.5" />}
                        {t(playing ? "stop" : "listen")}
                      </button>
                    </div>
                    <p className="mt-3 text-[15px] leading-7 text-fg-muted text-pretty">{m.answer}</p>
                    {speechError === key && <p className="mt-2 text-xs text-danger">{t("previewFailed")}</p>}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {record.transcript.length > 0 && (
          <section>
            <button
              type="button"
              onClick={() => setShowTranscript((s) => !s)}
              className="flex w-full items-center justify-between rounded-2xl border border-line bg-elevated px-5 py-3.5 text-sm font-medium"
              aria-expanded={showTranscript}
            >
              {t(showTranscript ? "hideTranscript" : "showTranscript")}
              <ChevronDown className={cn("size-4 transition-transform", showTranscript && "rotate-180")} />
            </button>
            {showTranscript && (
              <div className="mt-6">
                <Transcript entries={record.transcript} voice={voice} />
              </div>
            )}
          </section>
        )}

        <footer className="flex flex-col items-center gap-3 border-t border-line pt-8 text-center">
          <Link
            href="/"
            onClick={() => window.dispatchEvent(new Event(NEW_TEST_EVENT))}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-fg shadow-soft"
          >
            <Mic className="size-4" />
            {t("takeAnother")}
          </Link>
          <p className="text-xs text-fg-subtle">{t("disclaimer")}</p>
          <p className="text-[11px] text-fg-subtle">{t("poweredBy", { models })}</p>
        </footer>
      </article>
    </div>
  );
}

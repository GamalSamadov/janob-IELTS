"use client";

import { ArrowRight, Check, GraduationCap, Headphones, Languages, Mic, Pause, Volume2 } from "lucide-react";
import { useState } from "react";
import type { Accent, ExamMode, ExamSetup } from "@/lib/exam/types";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { ACCENTS, VOICES } from "@/lib/voices";
import { ExaminerAvatar, Segmented, Spinner } from "../ui/primitives";
import { SpeechError, useSpeechPlayer } from "../ui/use-speech";

export function SetupScreen({
  setup,
  onChange,
  onStart,
}: {
  setup: ExamSetup;
  onChange: (patch: Partial<ExamSetup>) => void;
  onStart: () => void;
}) {
  const { t, lang } = useI18n();
  const speech = useSpeechPlayer();
  const [previewError, setPreviewError] = useState<string | null>(null);

  const preview = (voiceId: string) => {
    if (speech.playingKey === voiceId || speech.loadingKey === voiceId) return speech.stop();
    setPreviewError(null);
    speech
      .play(voiceId, async () => {
        // Pre-rendered previews (scripts/generate-voice-previews.ts) play instantly; otherwise synthesize.
        const file = await fetch(`/voices/${voiceId}-${setup.accent}.mp3`);
        return file.ok ? file : fetch(`/api/tts?voice=${voiceId}&accent=${setup.accent}`);
      })
      .catch((error) => {
        const code = error instanceof SpeechError ? error.code : "";
        setPreviewError(code === "not_configured" || code === "auth" ? t(`err_${code}`) : t("previewFailed"));
      });
  };

  const start = () => {
    speech.stop();
    onStart();
  };

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-4 py-10 sm:px-6">
        <header className="mb-9 text-center animate-fade-up">
          <h1 className="font-serif text-[40px] leading-[1.1] tracking-tight text-balance sm:text-5xl">{t("greeting")}</h1>
          <p className="mx-auto mt-4 max-w-xl text-[15px] leading-6 text-fg-muted text-pretty">{t("greetingSub")}</p>
        </header>

        <section className="animate-fade-up [animation-delay:60ms]">
          <div className="mb-3 flex items-end justify-between gap-3">
            <h2 className="text-sm font-medium">{t("chooseExaminer")}</h2>
            {previewError && <span className="text-right text-xs text-danger">{previewError}</span>}
          </div>
          <div role="radiogroup" aria-label={t("chooseExaminer")} className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {VOICES.map((voice) => {
              const selected = voice.id === setup.voice;
              const playing = speech.playingKey === voice.id;
              const loading = speech.loadingKey === voice.id;
              return (
                <div key={voice.id} className="relative">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onChange({ voice: voice.id })}
                    className={cn(
                      "flex w-full flex-col items-start gap-3 rounded-2xl border p-3.5 text-left transition-all",
                      selected
                        ? "border-fg bg-elevated shadow-soft"
                        : "border-line bg-elevated/60 hover:border-line-strong hover:bg-elevated",
                    )}
                  >
                    <span className="relative">
                      <ExaminerAvatar voice={voice} size={40} />
                      {selected && (
                        <span className="absolute -bottom-0.5 -right-0.5 flex size-[18px] items-center justify-center rounded-full border-2 border-elevated bg-fg text-bg">
                          <Check className="size-2.5" strokeWidth={3.5} />
                        </span>
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[15px] font-medium leading-5">{voice.name}</span>
                      <span className="mt-0.5 block truncate text-xs text-fg-muted">{voice.trait[lang]}</span>
                      <span className="mt-0.5 block text-[11px] text-fg-subtle">
                        {t(voice.gender === "female" ? "female" : "male")}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => preview(voice.id)}
                    aria-label={`${t(playing ? "stop" : "listen")}: ${voice.name}`}
                    title={t(playing ? "stop" : "listen")}
                    className={cn(
                      "absolute right-2.5 top-2.5 inline-flex size-8 items-center justify-center rounded-full border transition-colors",
                      playing
                        ? "border-accent bg-accent text-accent-fg"
                        : "border-line bg-bg text-fg-muted hover:border-line-strong hover:text-fg",
                    )}
                  >
                    {loading ? <Spinner className="size-3.5" /> : playing ? <Pause className="size-3.5" /> : <Volume2 className="size-3.5" />}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-6 grid gap-4 animate-fade-up [animation-delay:120ms] sm:grid-cols-[1.35fr_1fr]">
          <div>
            <div className="mb-2 text-sm font-medium">{t("format")}</div>
            <Segmented<ExamMode>
              label={t("format")}
              value={setup.mode}
              onChange={(mode) => onChange({ mode })}
              options={[
                { value: "full", label: t("modeFull"), hint: t("modeFullHint") },
                { value: "quick", label: t("modeQuick"), hint: t("modeQuickHint") },
              ]}
            />
          </div>
          <div>
            <div className="mb-2 text-sm font-medium">{t("accent")}</div>
            <Segmented<Accent>
              label={t("accent")}
              value={setup.accent}
              onChange={(accent) => {
                speech.stop();
                onChange({ accent });
              }}
              options={ACCENTS.map((a) => ({ value: a, label: t(`accent_${a}`), hint: flag(a) }))}
            />
          </div>
        </section>

        <div className="sticky bottom-0 z-10 -mx-4 mt-8 flex flex-col items-center gap-3 bg-gradient-to-t from-bg from-60% to-transparent px-4 pb-4 pt-6 animate-fade-up [animation-delay:180ms] sm:static sm:mx-0 sm:bg-none sm:p-0">
          <button
            type="button"
            onClick={start}
            className="group inline-flex h-12 items-center gap-2.5 rounded-full bg-primary pl-5 pr-6 text-[15px] font-medium text-primary-fg shadow-soft transition-transform hover:scale-[1.02] active:scale-[0.99]"
          >
            <Mic className="size-[18px]" />
            {t("start")}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </button>
          <p className="flex items-center gap-1.5 text-xs text-fg-subtle">
            <Headphones className="size-3.5" />
            {t("startHint")}
          </p>
        </div>

        <ul className="mt-12 grid gap-3 border-t border-line pt-6 text-[13px] leading-5 text-fg-muted animate-fade-up [animation-delay:240ms] sm:grid-cols-3">
          {[
            { icon: Mic, text: t("how1") },
            { icon: Languages, text: t("how2") },
            { icon: GraduationCap, text: t("how3") },
          ].map(({ icon: Icon, text }, i) => (
            <li key={i} className="flex gap-2.5">
              <Icon className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function flag(accent: Accent): string {
  return accent === "british" ? "🇬🇧" : accent === "american" ? "🇺🇸" : "🇦🇺";
}

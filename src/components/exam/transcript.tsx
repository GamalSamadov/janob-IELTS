"use client";

import { Languages } from "lucide-react";
import type { ExamPart, TranscriptEntry } from "@/lib/exam/types";
import { languageName, useI18n } from "@/lib/i18n";
import type { DictKey } from "@/lib/i18n-dict";
import { cn } from "@/lib/utils";
import type { ExaminerVoice } from "@/lib/voices";
import { ExaminerAvatar } from "../ui/primitives";

type Entry = TranscriptEntry & { live?: boolean };

export function PartDivider({ part }: { part: ExamPart }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle">
      <span className="h-px flex-1 bg-line" />
      {t(`part${part}` as DictKey)}
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

function Caret() {
  return <span className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[3px] rounded-full bg-fg-muted animate-blink" />;
}

export function Transcript({ entries, voice }: { entries: Entry[]; voice: ExaminerVoice }) {
  const { t, lang } = useI18n();

  return (
    <div className="space-y-6">
      {entries.map((entry) => {
        if (entry.role === "divider") return <PartDivider key={entry.id} part={entry.part} />;

        if (entry.role === "examiner") {
          return (
            <div key={entry.id} className="flex gap-3 animate-fade-up">
              <ExaminerAvatar voice={voice} size={28} className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 text-xs font-medium text-fg-muted">{voice.name}</div>
                <p className="text-[15.5px] leading-7 text-pretty">
                  {entry.text.trim()}
                  {entry.live && <Caret />}
                  {entry.interrupted && <span className="ml-1.5 text-xs text-fg-subtle">· {t("interrupted")}</span>}
                </p>
              </div>
            </div>
          );
        }

        const otherLanguage = entry.lang && !entry.lang.toLowerCase().startsWith("en");
        return (
          <div key={entry.id} className="flex flex-col items-end gap-1 animate-fade-up">
            <div
              className={cn(
                "max-w-[85%] rounded-3xl bg-bubble px-4 py-2.5 text-[15.5px] leading-7 text-pretty sm:max-w-[75%]",
                otherLanguage && "ring-1 ring-warn/40",
              )}
            >
              {entry.text.trim() || "…"}
              {entry.live && <Caret />}
            </div>
            {otherLanguage && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-medium text-warn">
                <Languages className="size-3" />
                {languageName(entry.lang!, lang)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

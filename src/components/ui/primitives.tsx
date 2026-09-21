"use client";

import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ExaminerVoice } from "@/lib/voices";

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cn("size-4 animate-spin", className)} aria-hidden />;
}

export function ExaminerAvatar({ voice, size = 36, className }: { voice: ExaminerVoice; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white", className)}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: `linear-gradient(140deg, oklch(0.72 0.12 ${voice.hue}), oklch(0.5 0.13 ${voice.hue + 30}))`,
      }}
    >
      {voice.name[0]}
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size = "md",
}: {
  value: T;
  options: { value: T; label: ReactNode; hint?: ReactNode; title?: string }[];
  onChange: (value: T) => void;
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex w-full rounded-xl bg-muted p-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex flex-1 flex-col items-center justify-center rounded-[9px] transition-all",
              size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-2 text-sm",
              active ? "bg-elevated text-fg shadow-soft" : "text-fg-muted hover:text-fg",
            )}
          >
            <span className="font-medium">{option.label}</span>
            {option.hint && <span className="mt-0.5 text-[11px] text-fg-subtle">{option.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function SectionTitle({ icon, children, sub }: { icon?: ReactNode; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-4">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
        {icon && <span className="text-fg-muted">{icon}</span>}
        {children}
      </h2>
      {sub && <p className="mt-1 text-sm text-fg-muted">{sub}</p>}
    </div>
  );
}

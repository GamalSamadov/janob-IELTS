"use client";

import { useEffect, useRef } from "react";
import type { ExamSession } from "@/lib/live/exam-session";
import { cn } from "@/lib/utils";

export type OrbState = "examiner" | "candidate" | "listening" | "prep" | "idle";

const FILL: Record<OrbState, string> = {
  examiner:
    "radial-gradient(circle at 32% 28%, color-mix(in oklab, var(--accent) 45%, white), var(--accent) 58%, color-mix(in oklab, var(--accent) 65%, black))",
  candidate:
    "radial-gradient(circle at 32% 28%, color-mix(in oklab, var(--fg) 45%, var(--bg)), var(--fg) 62%)",
  listening:
    "radial-gradient(circle at 32% 28%, color-mix(in oklab, var(--fg) 25%, var(--bg)), color-mix(in oklab, var(--fg) 70%, var(--bg)) 70%)",
  prep: "radial-gradient(circle at 32% 28%, color-mix(in oklab, var(--warn) 40%, white), var(--warn) 65%)",
  idle: "radial-gradient(circle at 32% 28%, var(--bg-muted), var(--border-strong) 75%)",
};

/** Audio-reactive orb: scales with the examiner's or the candidate's voice. */
export function Orb({ session, state, size = 56 }: { session: ExamSession; state: OrbState; size?: number }) {
  const coreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    let level = 0;
    const tick = () => {
      const { examiner, candidate } = session.levels();
      const target = Math.max(examiner, candidate);
      level += (target - level) * (target > level ? 0.35 : 0.12);
      if (coreRef.current) coreRef.current.style.transform = `scale(${1 + level * 0.42})`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [session]);

  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size + 16, height: size + 16 }}>
      {state === "examiner" && (
        <span
          className="absolute rounded-full animate-ripple"
          style={{ width: size, height: size, background: "color-mix(in oklab, var(--accent) 35%, transparent)" }}
        />
      )}
      <div
        className={cn(
          "rounded-full transition-[background] duration-500 will-change-transform",
          (state === "listening" || state === "idle") && "animate-breathe",
        )}
        style={{ width: size, height: size }}
      >
        <div
          ref={coreRef}
          className="size-full rounded-full shadow-[inset_0_-6px_14px_rgb(0_0_0/0.18)] transition-[background] duration-500"
          style={{ background: FILL[state] }}
        />
      </div>
    </div>
  );
}

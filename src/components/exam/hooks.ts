"use client";

import { useEffect, useState } from "react";
import type { ExamSession } from "@/lib/live/exam-session";

/** Current time, refreshed every `intervalMs` while `enabled`. */
export function useNow(intervalMs = 1000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [intervalMs, enabled]);
  return now;
}

/**
 * For the status line: `speaking` while the microphone picks up the candidate's voice,
 * `waiting` once they have answered and gone quiet but the examiner has not replied yet.
 */
export function useCandidateActivity(session: ExamSession): { speaking: boolean; waiting: boolean } {
  const [state, setState] = useState({ speaking: false, waiting: false });
  useEffect(() => {
    let hold = 0;
    let quietTicks = 0;
    const id = setInterval(() => {
      const loud = session.levels().candidate > 0.12;
      if (loud) {
        hold = 6;
        quietTicks = 0;
      } else {
        if (hold > 0) hold--;
        quietTicks++;
      }
      const speaking = hold > 0;
      const waiting = !speaking && quietTicks > 12 && session.replyPending();
      setState((prev) => (prev.speaking === speaking && prev.waiting === waiting ? prev : { speaking, waiting }));
    }, 120);
    return () => clearInterval(id);
  }, [session]);
  return state;
}

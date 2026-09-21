"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";

/** Fired by "New test" so the home screen can reset even when already on "/". */
export const NEW_TEST_EVENT = "janob:new-test";

interface ExamGuardValue {
  active: boolean;
  setActive: (active: boolean) => void;
  /** Asks before leaving a running test. Returns true when navigation may continue. */
  confirmLeave: () => boolean;
}

const ExamGuardContext = createContext<ExamGuardValue | null>(null);

export function ExamGuardProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [active, setActive] = useState(false);

  const confirmLeave = useCallback(() => !active || window.confirm(t("leaveConfirm")), [active, t]);

  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [active]);

  const value = useMemo(() => ({ active, setActive, confirmLeave }), [active, confirmLeave]);
  return <ExamGuardContext.Provider value={value}>{children}</ExamGuardContext.Provider>;
}

export function useExamGuard(): ExamGuardValue {
  const value = useContext(ExamGuardContext);
  if (!value) throw new Error("useExamGuard must be used inside <ExamGuardProvider>");
  return value;
}

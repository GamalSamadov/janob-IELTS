"use client";

import { Menu, SquarePen } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { NEW_TEST_EVENT, useExamGuard } from "./exam-guard";
import { Logo } from "./logo";
import { Sidebar } from "./sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const guard = useExamGuard();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex h-dvh overflow-hidden">
      <aside
        className={cn(
          "hidden shrink-0 border-r border-line bg-sidebar transition-[width] duration-200 md:block",
          collapsed ? "w-14" : "w-[272px]",
        )}
      >
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40 animate-fade-up" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[284px] max-w-[85vw] bg-sidebar shadow-2xl">
            <Sidebar onToggle={() => setDrawerOpen(false)} onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-line px-2 md:hidden">
          <button
            type="button"
            aria-label={t("openSidebar")}
            onClick={() => setDrawerOpen(true)}
            className="inline-flex size-9 items-center justify-center rounded-lg text-fg-muted hover:bg-hover"
          >
            <Menu className="size-5" />
          </button>
          <span className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
            <Logo className="size-6" />
            {t("appName")}
          </span>
          <Link
            href="/"
            aria-label={t("newTest")}
            onClick={(e) => {
              if (!guard.confirmLeave()) return e.preventDefault();
              guard.setActive(false);
              window.dispatchEvent(new Event(NEW_TEST_EVENT));
            }}
            className="inline-flex size-9 items-center justify-center rounded-lg text-fg-muted hover:bg-hover"
          >
            <SquarePen className="size-[18px]" />
          </Link>
        </header>
        <main className="relative min-h-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

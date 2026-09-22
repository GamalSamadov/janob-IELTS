"use client";

import { PanelLeftClose, PanelLeftOpen, SquarePen, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import { formatBand } from "@/lib/exam/scoring";
import { useI18n } from "@/lib/i18n";
import { sessionStore, useSessions } from "@/lib/storage";
import { cn, formatDate } from "@/lib/utils";
import { AccountMenu } from "./account-menu";
import { NEW_TEST_EVENT, useExamGuard } from "./exam-guard";
import { Logo } from "./logo";

function IconButton({
  label,
  onClick,
  children,
  className,
}: {
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-hover hover:text-fg",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Sidebar({
  collapsed = false,
  onToggle,
  onNavigate,
}: {
  collapsed?: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}) {
  const { t, lang } = useI18n();
  const sessions = useSessions();
  const pathname = usePathname();
  const router = useRouter();
  const guard = useExamGuard();

  const navigate = (event: MouseEvent, href: string) => {
    if (!guard.confirmLeave()) {
      event.preventDefault();
      return;
    }
    guard.setActive(false);
    if (href === "/") window.dispatchEvent(new Event(NEW_TEST_EVENT));
    onNavigate?.();
  };

  const remove = (id: string) => {
    if (!window.confirm(t("deleteConfirm"))) return;
    sessionStore.remove(id);
    if (pathname === `/s/${id}`) router.push("/");
  };

  if (collapsed) {
    return (
      <div className="flex h-full w-full flex-col items-center gap-1 py-3">
        <IconButton label={t("openSidebar")} onClick={onToggle}>
          <PanelLeftOpen className="size-[18px]" />
        </IconButton>
        <Link
          href="/"
          onClick={(e) => navigate(e, "/")}
          aria-label={t("newTest")}
          title={t("newTest")}
          className="inline-flex size-9 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-hover hover:text-fg"
        >
          <SquarePen className="size-[18px]" />
        </Link>
        <div className="mt-auto">
          <AccountMenu compact />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between px-3">
        <Link href="/" onClick={(e) => navigate(e, "/")} className="flex items-center gap-2 rounded-lg px-1.5 py-1">
          <Logo className="size-7" />
          <span className="text-[15px] font-semibold tracking-tight">{t("appName")}</span>
        </Link>
        <IconButton label={t("closeSidebar")} onClick={onToggle}>
          <PanelLeftClose className="size-[18px]" />
        </IconButton>
      </div>

      <div className="px-3">
        <Link
          href="/"
          onClick={(e) => navigate(e, "/")}
          className="flex h-10 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors hover:bg-hover"
        >
          <SquarePen className="size-[17px] text-fg-muted" />
          {t("newTest")}
        </Link>
      </div>

      <nav className="scrollbar-thin mt-4 min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <div className="px-2.5 pb-1.5 text-xs font-medium text-fg-subtle">{t("recent")}</div>
        {sessions.length === 0 ? (
          <p className="px-2.5 py-2 text-[13px] leading-5 text-fg-subtle">{t("noHistory")}</p>
        ) : (
          <ul className="space-y-0.5">
            {sessions.map((s) => {
              const active = pathname === `/s/${s.id}`;
              return (
                <li key={s.id} className="group relative">
                  <Link
                    href={`/s/${s.id}`}
                    onClick={(e) => navigate(e, `/s/${s.id}`)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-2.5 py-2 pr-9 transition-colors",
                      active ? "bg-hover" : "hover:bg-hover",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px]">
                        {t(s.setup.mode === "full" ? "modeFull" : "modeQuick")} · {s.examinerName}
                      </span>
                      <span className="block truncate text-xs text-fg-subtle">{formatDate(s.createdAt, lang)}</span>
                    </span>
                    <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs font-semibold tabular-nums group-hover:opacity-0">
                      {formatBand(s.evaluation.overall)}
                    </span>
                  </Link>
                  <button
                    type="button"
                    aria-label={t("delete")}
                    title={t("delete")}
                    onClick={() => remove(s.id)}
                    className="absolute right-1.5 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-fg-subtle opacity-0 transition hover:bg-hover hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      <div className="border-t border-line p-2">
        <AccountMenu />
      </div>
    </div>
  );
}

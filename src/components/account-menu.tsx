"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import type { UserResource } from "@clerk/nextjs/types";
import { ChevronsUpDown, LogOut, Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Lang } from "@/lib/exam/types";
import { useI18n } from "@/lib/i18n";
import { setThemePref, useThemePref, type ThemePref } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useExamGuard } from "./exam-guard";
import { Segmented } from "./ui/primitives";

function displayName(user: UserResource): string {
  // Accounts created while names were off in Clerk keep the name in metadata (see LoginScreen).
  const saved = typeof user.unsafeMetadata.name === "string" ? user.unsafeMetadata.name : "";
  return user.fullName?.trim() || saved.trim() || user.primaryEmailAddress?.emailAddress.split("@")[0] || "";
}

function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words;
  return letters.map((word) => Array.from(word)[0]).join("").toUpperCase() || "?";
}

function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-primary text-[12.5px] font-semibold text-primary-fg",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

/** Bottom of the sidebar, as in claude.ai: who is signed in, preferences and "Log out". */
export function AccountMenu({ compact = false }: { compact?: boolean }) {
  const { t, lang, setLang } = useI18n();
  const theme = useThemePref();
  const guard = useExamGuard();
  const { signOut } = useClerk();
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!user) {
    return compact ? (
      <span className="block size-8 animate-pulse rounded-full bg-muted" />
    ) : (
      <div className="flex items-center gap-3 px-2 py-2">
        <span className="size-8 shrink-0 animate-pulse rounded-full bg-muted" />
        <span className="h-3 w-28 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  const name = displayName(user);
  const email = user.primaryEmailAddress?.emailAddress ?? "";

  const logOut = () => {
    if (!guard.confirmLeave()) return;
    guard.setActive(false);
    setOpen(false);
    void signOut({ redirectUrl: "/login" });
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={t("accountMenu")}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={compact ? name : undefined}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center rounded-lg transition-colors hover:bg-hover",
          compact ? "size-9 justify-center" : "w-full gap-3 px-2 py-2 text-left",
          open && "bg-hover",
        )}
      >
        <Avatar name={name} className={compact ? "size-7 text-[11.5px]" : "size-8"} />
        {!compact && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-medium">{name}</span>
              {email && email !== name && <span className="block truncate text-xs text-fg-subtle">{email}</span>}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-fg-subtle" />
          </>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t("accountMenu")}
          className={cn(
            "absolute z-50 rounded-xl border border-line bg-elevated p-1.5 shadow-soft animate-fade-up",
            compact ? "bottom-0 left-full ml-2 w-64" : "inset-x-0 bottom-full mb-1.5",
          )}
        >
          <p className="truncate px-2.5 pb-1.5 pt-1 text-[13px] text-fg-subtle">{email}</p>
          <div className="space-y-2.5 px-1.5 py-1.5">
            <div>
              <p className="mb-1.5 px-1 text-xs text-fg-subtle">{t("language")}</p>
              <Segmented<Lang>
                size="sm"
                label={t("language")}
                value={lang}
                onChange={setLang}
                options={[
                  { value: "uz", label: "O‘zbekcha" },
                  { value: "en", label: "English" },
                ]}
              />
            </div>
            <div>
              <p className="mb-1.5 px-1 text-xs text-fg-subtle">{t("theme")}</p>
              <Segmented<ThemePref>
                size="sm"
                label={t("theme")}
                value={theme}
                onChange={setThemePref}
                options={[
                  { value: "light", label: <Sun className="my-0.5 size-3.5" />, title: t("themeLight") },
                  { value: "dark", label: <Moon className="my-0.5 size-3.5" />, title: t("themeDark") },
                  { value: "system", label: <Monitor className="my-0.5 size-3.5" />, title: t("themeSystem") },
                ]}
              />
            </div>
          </div>
          <div className="my-1 h-px bg-line" />
          <button
            type="button"
            onClick={logOut}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] transition-colors hover:bg-hover"
          >
            <LogOut className="size-4 text-fg-muted" />
            {t("logOut")}
          </button>
        </div>
      )}
    </div>
  );
}

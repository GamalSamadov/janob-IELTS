import type { Lang } from "./exam/types";

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/** 125 → "2:05" */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const UZ_MONTHS = ["yan", "fev", "mar", "apr", "may", "iyun", "iyul", "avg", "sen", "okt", "noy", "dek"];

export function formatDate(timestamp: number, lang: Lang): string {
  const date = new Date(timestamp);
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  // Browsers ship incomplete Uzbek locale data ("M09"), so format Uzbek dates by hand.
  if (lang === "uz") return `${date.getDate()}-${UZ_MONTHS[date.getMonth()]}, ${time}`;
  return `${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(date)}, ${time}`;
}

/** Same styling as `formatDate` but without the time, for renewal dates. */
export function formatDay(timestamp: number, lang: Lang): string {
  const date = new Date(timestamp);
  if (lang === "uz") return `${date.getDate()}-${UZ_MONTHS[date.getMonth()]}`;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(date);
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Where to go after signing in: only paths on this site, never back to the login screen. */
export function safeRedirect(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value === "/login" || value.startsWith("/login/") || value.startsWith("/login?") ? "/" : value;
}

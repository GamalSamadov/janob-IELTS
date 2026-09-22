"use client";

import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { Globe } from "lucide-react";
import type { ReactNode } from "react";
import { Logo } from "@/components/logo";
import { useI18n } from "@/lib/i18n";
import type { DictKey } from "@/lib/i18n-dict";
import { cn } from "@/lib/utils";

export const fieldClass =
  "h-10 w-full rounded-[10px] bg-auth-field px-4 text-base text-fg shadow-[inset_0_0_0_1px_var(--auth-line)] outline-none transition-shadow placeholder:text-fg-subtle focus:shadow-[inset_0_0_0_1px_var(--border-strong),0_0_0_3px_color-mix(in_oklab,var(--accent)_18%,transparent)] disabled:opacity-60";

const buttonBase =
  "inline-flex h-10 w-full items-center justify-center gap-2.5 rounded-[10px] px-4 text-[15px] transition-colors disabled:cursor-default disabled:opacity-60";

export const primaryButtonClass = cn(buttonBase, "bg-primary font-medium text-primary-fg hover:opacity-90");

export const secondaryButtonClass = cn(
  buttonBase,
  "bg-auth-secondary text-fg shadow-[inset_0_0_0_1px_var(--auth-line)] hover:bg-auth-secondary-hover",
);

export const linkButtonClass =
  "rounded text-fg-muted underline-offset-4 transition-colors hover:text-fg hover:underline disabled:pointer-events-none disabled:opacity-60";

/** Page frame shared by the login screen and the OAuth callback. */
export function AuthPage({ children }: { children: ReactNode }) {
  const { t, lang, setLang } = useI18n();
  const other = lang === "uz" ? "en" : "uz";

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-[72px] shrink-0 items-center justify-between px-5 md:px-12">
        <span className="flex items-center gap-2">
          <Logo className="size-7" />
          <span className="text-[17px] font-semibold tracking-tight">{t("appName")}</span>
        </span>
        <button
          type="button"
          onClick={() => setLang(other)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-fg-muted transition-colors hover:bg-hover hover:text-fg"
        >
          <Globe className="size-3.5" />
          {other === "en" ? "English" : "O‘zbekcha"}
        </button>
      </header>
      <main className="flex flex-1 flex-col items-center px-4 pb-16 pt-[max(2rem,7vh)]">{children}</main>
    </div>
  );
}

/** The headline, subtitle and card of the login screen. */
export function AuthCard({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <>
      <h1 className="text-balance text-center font-serif text-[44px] leading-[1.1] tracking-[-0.01em] md:text-[60px]">
        {t("loginTitle")}
      </h1>
      <p className="mt-3 text-balance text-center font-serif text-[19px] md:text-[21px]">{t("loginSubtitle")}</p>
      <div className="mt-8 w-full max-w-[448px] rounded-[28px] border-[0.5px] border-auth-line bg-auth-card p-6 shadow-auth md:rounded-[32px] md:p-7">
        {children}
        {/* Clerk renders its bot protection (Cloudflare Turnstile) here when it is needed. */}
        <div id="clerk-captcha" className="empty:hidden mt-4 flex justify-center" />
      </div>
    </>
  );
}

export function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.81z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3.01c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.1A12 12 0 0 0 12 24z"
      />
      <path fill="#FBBC05" d="M5.29 14.28a7.2 7.2 0 0 1 0-4.57v-3.1H1.28a12 12 0 0 0 0 10.78l4.01-3.11z" />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44A11.53 11.53 0 0 0 12 0 12 12 0 0 0 1.28 6.61l4.01 3.1C6.23 6.88 8.88 4.77 12 4.77z"
      />
    </svg>
  );
}

/** Clerk returns this when a verified email has no account yet and sign-up should take over. */
export function isSignUpTransfer(error: unknown): boolean {
  return isClerkAPIResponseError(error) && error.errors[0]?.code === "sign_up_if_missing_transfer";
}

/** Maps a Clerk API error to a translated message. */
export function authErrorKey(error: unknown): DictKey {
  if (!isClerkAPIResponseError(error)) return "err_sign_in_failed";
  if (error.status === 429) return "err_rate_limited";
  switch (error.errors[0]?.code) {
    case "form_param_format_invalid":
    case "form_param_nil":
      return "err_invalid_email";
    case "form_code_incorrect":
      return "err_code_incorrect";
    case "verification_expired":
    case "verification_failed":
      return "err_code_expired";
    case "too_many_requests":
      return "err_rate_limited";
    case "not_allowed_access":
    case "sign_up_restricted":
    case "sign_up_mode_restricted":
      return "err_sign_up_unavailable";
    default:
      return "err_sign_in_failed";
  }
}

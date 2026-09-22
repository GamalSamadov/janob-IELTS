"use client";

import { useSignIn, useSignUp } from "@clerk/nextjs";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import type { SetActiveNavigate } from "@clerk/nextjs/types";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Spinner } from "@/components/ui/primitives";
import { useI18n } from "@/lib/i18n";
import type { DictKey } from "@/lib/i18n-dict";
import { cn, formatClock } from "@/lib/utils";
import {
  AuthCard,
  AuthPage,
  authErrorKey,
  fieldClass,
  GoogleIcon,
  isSignUpTransfer,
  linkButtonClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "./auth-ui";

type Step = "start" | "code" | "name";
type Busy = "google" | "email" | "code" | "resend" | "name" | null;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_LENGTH = 6;
const RESEND_AFTER_SECONDS = 30;

function hasErrorCode(error: unknown, code: string): boolean {
  return isClerkAPIResponseError(error) && error.errors.some((e) => e.code === code);
}

function Message({ error, notice }: { error: DictKey | null; notice?: DictKey | null }) {
  const { t } = useI18n();
  if (error) {
    return (
      <p role="alert" className="mt-2 text-[13px] leading-5 text-danger">
        {t(error)}
      </p>
    );
  }
  if (notice) {
    return (
      <p role="status" className="mt-2 text-[13px] leading-5 text-fg-muted">
        {t(notice)}
      </p>
    );
  }
  return null;
}

/**
 * Passwordless sign-in in the style of claude.ai: Google, or an email code. The same flow signs
 * existing users in and creates accounts for new ones (after asking what to call them).
 */
export function LoginScreen({ next }: { next: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const [step, setStep] = useState<Step>("start");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<DictKey | null>(null);
  const [notice, setNotice] = useState<DictKey | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const fail = (reason: unknown, fallback: DictKey = "err_sign_in_failed") => {
    setBusy(null);
    // Signed in meanwhile (e.g. in another tab): nothing left to do here.
    if (hasErrorCode(reason, "session_exists")) return router.replace(next);
    setError(reason ? authErrorKey(reason) : fallback);
  };

  const navigate: SetActiveNavigate = ({ session, decorateUrl }) => {
    // Session tasks (organizations, forced password reset…) are not enabled for this app.
    if (session?.currentTask) return fail(null);
    const url = decorateUrl(next);
    if (url.startsWith("http")) window.location.href = url;
    else router.push(url);
  };

  const continueWithGoogle = async () => {
    setBusy("google");
    setError(null);
    const { error } = await signIn.sso({
      strategy: "oauth_google",
      redirectUrl: next,
      redirectCallbackUrl: `/login/sso-callback?next=${encodeURIComponent(next)}`,
    });
    // On success the browser is already on its way to Google.
    if (error) fail(error);
  };

  const submitEmail = async (event: FormEvent) => {
    event.preventDefault();
    const address = email.trim();
    if (!EMAIL_PATTERN.test(address)) return setError("err_invalid_email");
    setBusy("email");
    setError(null);
    // One flow for everyone: unknown emails are verified first and turned into a sign-up afterwards.
    const created = await signIn.create({ identifier: address, signUpIfMissing: true });
    if (created.error) return fail(created.error);
    const sent = await signIn.emailCode.sendCode();
    if (sent.error) return fail(sent.error);
    setEmail(address);
    setCode("");
    setNotice(null);
    setCooldown(RESEND_AFTER_SECONDS);
    setBusy(null);
    setStep("code");
  };

  const verify = async (value: string) => {
    if (value.length !== CODE_LENGTH) return;
    setBusy("code");
    setError(null);
    setNotice(null);
    const { error } = await signIn.emailCode.verifyCode({ code: value });
    if (isSignUpTransfer(error)) {
      setBusy(null);
      setStep("name");
      return;
    }
    if (error) return fail(error);
    if (signIn.status !== "complete") return fail(null);
    const finalized = await signIn.finalize({ navigate });
    if (finalized.error) fail(finalized.error);
  };

  const resend = async () => {
    setBusy("resend");
    setError(null);
    const { error } = await signIn.emailCode.sendCode();
    setBusy(null);
    if (error) return setError(authErrorKey(error));
    setCode("");
    setNotice("codeResent");
    setCooldown(RESEND_AFTER_SECONDS);
  };

  const restart = async () => {
    await signIn.reset();
    setStep("start");
    setCode("");
    setName("");
    setError(null);
    setNotice(null);
    setBusy(null);
  };

  const createAccount = async (event: FormEvent) => {
    event.preventDefault();
    const fullName = name.trim().replace(/\s+/g, " ");
    if (!fullName) return;
    const [firstName, ...rest] = fullName.split(" ");
    setBusy("name");
    setError(null);
    let result = await signUp.create({ transfer: true, firstName, ...(rest.length ? { lastName: rest.join(" ") } : {}) });
    // With names switched off in the Clerk dashboard, keep the name on the account as metadata.
    if (hasErrorCode(result.error, "form_param_unknown")) {
      result = await signUp.create({ transfer: true, unsafeMetadata: { name: fullName } });
    }
    if (result.error) return fail(result.error);
    if (signUp.status !== "complete") {
      // The Clerk dashboard asks for more than this screen collects (usually a password).
      console.warn("[auth] Sign-up needs fields this screen does not collect:", signUp.missingFields);
      return fail(null, "err_sign_up_unavailable");
    }
    const finalized = await signUp.finalize({ navigate });
    if (finalized.error) fail(finalized.error);
  };

  return (
    <AuthPage>
      <AuthCard>
        <div key={step} className="animate-fade-up">
          {step === "start" && (
            <>
              <button
                type="button"
                onClick={continueWithGoogle}
                disabled={busy !== null}
                className={secondaryButtonClass}
              >
                {busy === "google" ? <Spinner /> : <GoogleIcon className="size-4" />}
                {t("continueWithGoogle")}
              </button>
              <p className="my-3 text-center text-xs text-fg-muted">{t("or")}</p>
              <form onSubmit={submitEmail} noValidate>
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  spellCheck={false}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder={t("emailPlaceholder")}
                  aria-label={t("emailPlaceholder")}
                  aria-invalid={error === "err_invalid_email"}
                  disabled={busy !== null}
                  className={fieldClass}
                />
                <Message error={error} />
                <button type="submit" disabled={busy !== null} className={cn(primaryButtonClass, "mt-4")}>
                  {busy === "email" && <Spinner />}
                  {t("continueWithEmail")}
                </button>
              </form>
              <p className="mt-4 text-center text-xs leading-5 text-fg-subtle">{t("loginNote")}</p>
            </>
          )}

          {step === "code" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void verify(code);
              }}
            >
              <p className="mb-4 text-center text-sm leading-6 text-fg-muted">
                {t("codeSentTo")}
                <span className="block truncate font-medium text-fg">{email}</span>
              </p>
              <input
                autoFocus
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={CODE_LENGTH}
                value={code}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH);
                  setCode(value);
                  if (error) setError(null);
                  // Submit as soon as the last digit is typed or a code is pasted.
                  if (value.length === CODE_LENGTH && busy === null) void verify(value);
                }}
                placeholder={t("codePlaceholder")}
                aria-label={t("codePlaceholder")}
                aria-invalid={error !== null}
                disabled={busy === "code"}
                className={cn(fieldClass, "text-center font-medium tracking-[0.4em] placeholder:font-normal placeholder:tracking-normal")}
              />
              <Message error={error} notice={notice} />
              <button
                type="submit"
                disabled={busy !== null || code.length !== CODE_LENGTH}
                className={cn(primaryButtonClass, "mt-4")}
              >
                {busy === "code" && <Spinner />}
                {t("verifyEmail")}
              </button>
              <div className="mt-4 flex items-center justify-between gap-3 text-[13px]">
                <button type="button" onClick={resend} disabled={busy !== null || cooldown > 0} className={linkButtonClass}>
                  {cooldown > 0 ? `${t("resendCode")} (${formatClock(cooldown)})` : t("resendCode")}
                </button>
                <button type="button" onClick={restart} disabled={busy === "code"} className={linkButtonClass}>
                  {t("useDifferentEmail")}
                </button>
              </div>
            </form>
          )}

          {step === "name" && (
            <form onSubmit={createAccount}>
              <label htmlFor="name" className="mb-4 block text-center text-[15px] font-medium">
                {t("nameTitle")}
              </label>
              <input
                id="name"
                autoFocus
                autoComplete="name"
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("namePlaceholder")}
                disabled={busy !== null}
                className={fieldClass}
              />
              <Message error={error} />
              <button type="submit" disabled={busy !== null || !name.trim()} className={cn(primaryButtonClass, "mt-4")}>
                {busy === "name" && <Spinner />}
                {t("continue")}
              </button>
              <p className="mt-4 text-center text-[13px]">
                <button type="button" onClick={restart} disabled={busy !== null} className={linkButtonClass}>
                  {t("useDifferentEmail")}
                </button>
              </p>
            </form>
          )}
        </div>
      </AuthCard>
    </AuthPage>
  );
}

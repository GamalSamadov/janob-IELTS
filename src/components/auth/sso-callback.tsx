"use client";

import { useAuth, useClerk, useSignIn, useSignUp } from "@clerk/nextjs";
import type { SetActiveNavigate } from "@clerk/nextjs/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/ui/primitives";
import { useI18n } from "@/lib/i18n";
import { AuthPage, primaryButtonClass } from "./auth-ui";

/**
 * Google sends users here when Clerk could not create a session right away: a first visit
 * (the sign-in becomes a sign-up) or a Google account that already belongs to a user.
 */
export function SsoCallback({ next }: { next: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const clerk = useClerk();
  const { isLoaded } = useAuth();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isLoaded || started.current) return;
    started.current = true;

    const navigate: SetActiveNavigate = ({ session, decorateUrl }) => {
      if (session?.currentTask) return setFailed(true);
      const url = decorateUrl(next);
      if (url.startsWith("http")) window.location.href = url;
      else router.push(url);
    };
    // Read through functions: the resources change while the steps below run.
    const signInStatus = () => signIn.status as string;
    const signUpStatus = () => signUp.status as string;

    void (async () => {
      if (signInStatus() === "complete") {
        await signIn.finalize({ navigate });
        return;
      }
      if (signUp.isTransferable) {
        // The Google account already has a user: turn the sign-up into a sign-in.
        await signIn.create({ transfer: true });
        if (signInStatus() === "complete") return void (await signIn.finalize({ navigate }));
      } else if (signIn.isTransferable) {
        // First visit with Google: create the account.
        await signUp.create({ transfer: true });
        if (signUpStatus() === "complete") return void (await signUp.finalize({ navigate }));
      } else if (signUpStatus() === "complete") {
        return void (await signUp.finalize({ navigate }));
      } else {
        const sessionId = signIn.existingSession?.sessionId ?? signUp.existingSession?.sessionId;
        if (sessionId) return void (await clerk.setActive({ session: sessionId, navigate }));
      }
      setFailed(true);
    })().catch(() => setFailed(true));
  }, [isLoaded, clerk, signIn, signUp, next, router]);

  return (
    <AuthPage>
      <div className="flex flex-1 flex-col items-center justify-center pb-[12vh] text-center animate-fade-up">
        {failed ? (
          <>
            <p className="max-w-sm text-[15px] leading-6 text-fg-muted">{t("err_oauth")}</p>
            <Link href="/login" className={`${primaryButtonClass} mt-5 w-auto px-5`}>
              {t("backToLogin")}
            </Link>
          </>
        ) : (
          <p className="flex items-center gap-2.5 text-[15px] text-fg-muted">
            <Spinner />
            {t("signingIn")}
          </p>
        )}
        <div id="clerk-captcha" className="empty:hidden mt-6" />
      </div>
    </AuthPage>
  );
}

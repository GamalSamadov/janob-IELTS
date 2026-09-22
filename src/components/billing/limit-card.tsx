"use client";

import { ArrowRight, Gauge } from "lucide-react";
import Link from "next/link";
import { useBilling } from "@/lib/billing/client";
import { useI18n } from "@/lib/i18n";
import { formatDay } from "@/lib/utils";

/** Shown instead of the start button once the account's tokens are gone. */
export function LimitCard({ className }: { className?: string }) {
  const { t, lang } = useI18n();
  const { billing } = useBilling();
  const renewsAt = billing?.renewsAt ? Date.parse(billing.renewsAt) : null;

  return (
    <div className={className}>
      <div className="mx-auto w-full max-w-md rounded-2xl border border-line bg-elevated p-6 text-left shadow-soft">
        <span className="inline-flex size-9 items-center justify-center rounded-full bg-warn-soft text-warn">
          <Gauge className="size-[18px]" />
        </span>
        <h2 className="mt-3 text-lg font-semibold">{t("limitTitle")}</h2>
        <p className="mt-1.5 text-sm leading-6 text-fg-muted">
          {renewsAt ? t("limitPaid", { date: formatDay(renewsAt, lang) }) : t("limitFree")}
        </p>
        <Link
          href="/pricing"
          className="group mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-primary pl-5 pr-4 text-sm font-medium text-primary-fg"
        >
          {t("limitCta")}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}

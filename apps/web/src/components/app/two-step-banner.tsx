"use client";

import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useSession } from "@/components/app/session";
import { useT } from "@/i18n";

/** Reminds people to set up the two-step sign-in their organization requires from a date. */
export function TwoStepBanner() {
  const t = useT();
  const { me } = useSession();
  const due = me.user.twoFactorDue;
  if (!due) return null;
  const date = t.date(due, { day: "numeric", month: "long" });
  const days = Math.max(0, Math.ceil((new Date(due).getTime() - Date.now()) / 86_400_000));
  return (
    <div className="flex items-center justify-center gap-2 border-b border-border bg-warning-soft px-4 py-1.5 text-center text-xs text-fg" data-testid="two-step-banner">
      <ShieldAlert className="size-3.5 shrink-0 text-warning" />
      <span>
        {t("{org} requires two-step sign-in from {date} ({when}). After that you'll need it to continue.", {
          org: me.org.name,
          date,
          when: days <= 1 ? t("tomorrow") : t.n(days, "in {n} day", "in {n} days"),
        })}
      </span>
      <Link href="/app/settings#security" className="shrink-0 font-medium underline underline-offset-2" data-testid="two-step-banner-setup">
        {t("Set it up now")}
      </Link>
    </div>
  );
}

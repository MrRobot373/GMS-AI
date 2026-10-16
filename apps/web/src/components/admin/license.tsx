"use client";

import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useSession } from "@/components/app/session";
import { cn } from "@/lib/cn";

import { msg, useT } from "@/i18n";
export const LICENSE_STATE: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  development: { label: msg("Development"), tone: "neutral" },
  missing: { label: msg("No license"), tone: "danger" },
  invalid: { label: msg("Invalid key"), tone: "danger" },
  valid: { label: msg("Active"), tone: "success" },
  check_in_overdue: { label: msg("Check-in overdue"), tone: "warning" },
  admin_locked: { label: msg("Admin paused"), tone: "warning" },
  expiring_grace: { label: msg("Expired · grace period"), tone: "warning" },
  expired: { label: msg("Expired"), tone: "danger" },
  revoked: { label: msg("Revoked"), tone: "danger" },
};

/** A thin strip above the app when the license needs attention. */
export function LicenseBanner({ className }: { className?: string }) {
  const t = useT();
  const { me } = useSession();
  const l = me.license;
  if (!l?.message) return null;
  const serious = !l.canUse || ["expired", "revoked", "missing", "invalid", "admin_locked"].includes(l.state);
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-2 border-b px-4 py-1.5 text-center text-xs",
        serious ? "border-danger/30 bg-danger-soft text-danger" : "border-border text-warning",
        className,
      )}
      data-testid="license-banner"
    >
      <TriangleAlert className="size-3.5 shrink-0" />
      <span>{l.message}</span>
      {me.isAdmin && (
        <Link href="/admin/license" className="shrink-0 underline underline-offset-2">
          {t("Open license")}
        </Link>
      )}
    </div>
  );
}

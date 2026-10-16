import { APPROVAL_PRESETS, type CatalogCategory } from "@aatmiq/shared";
import { BookOpen, Code2, CreditCard, Database, FileText, ListChecks, Mail, MessageSquare, Palette, Plug, Users } from "lucide-react";
import type { CSSProperties } from "react";
import { BRAND_ICONS } from "@/lib/brand-icons";
import { cn } from "@/lib/cn";
import { msg, type Translate } from "@/i18n";

const ICONS: Record<CatalogCategory, typeof Plug> = {
  "Email & calendar": Mail,
  "Files & docs": FileText,
  Design: Palette,
  "Chat & meetings": MessageSquare,
  "Projects & tasks": ListChecks,
  "CRM & support": Users,
  "Payments & commerce": CreditCard,
  Developer: Code2,
  Data: Database,
  Knowledge: BookOpen,
};

/**
 * A connector's tile: the app's logo (lib/brand-icons.ts), else its initial for a catalog app
 * without one, else its category's icon (custom servers get a plug).
 */
export function ConnectorIcon({
  catalogId,
  name,
  category,
  className,
}: {
  catalogId?: string | null;
  name?: string;
  category?: string | null;
  className?: string;
}) {
  const brand = catalogId ? BRAND_ICONS[catalogId] : undefined;
  const Icon = (category && ICONS[category as CatalogCategory]) || Plug;
  return (
    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-bg", className)}>
      {brand ? (
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className="size-[18px] fill-[var(--brand-light)] dark:fill-[var(--brand-dark)]"
          style={{ "--brand-light": brand.light ?? "var(--fg)", "--brand-dark": brand.dark ?? "var(--fg)" } as CSSProperties}
        >
          <path d={brand.path} />
        </svg>
      ) : catalogId && name?.trim() ? (
        <span aria-hidden className="text-[15px] font-medium text-fg-muted">
          {name.trim()[0]!.toUpperCase()}
        </span>
      ) : (
        <Icon className="size-4 text-fg-muted" />
      )}
    </span>
  );
}

export type ApprovalPreset = "changes" | "all" | "none" | "custom";

export function approvalPresetOf(rule: string): ApprovalPreset {
  if (rule === APPROVAL_PRESETS.all) return "all";
  if (rule === APPROVAL_PRESETS.none) return "none";
  if (rule === APPROVAL_PRESETS.changes) return "changes";
  return "custom";
}

export const APPROVAL_LABELS: Record<ApprovalPreset, string> = {
  changes: msg("Ask before changes (reading runs freely)"),
  all: msg("Ask before every action"),
  none: msg("Never ask"),
  custom: msg("Custom rule"),
};

export function approvalSummary(rule: string, t: Translate) {
  const p = approvalPresetOf(rule);
  if (p === "changes") return t("asks before changes");
  if (p === "all") return t("asks before every action");
  if (p === "none") return t("never asks");
  return t("asks before: {rule}", { rule });
}

export const AUTH_LABELS = { oauth: msg("Each person signs in"), token: msg("Shared token"), none: msg("No sign-in") } as const;

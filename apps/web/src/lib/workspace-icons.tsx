"use client";

import { useState } from "react";
import {
  Accessibility,
  Apple,
  Asterisk,
  Book,
  Braces,
  Brain,
  Briefcase,
  ChartColumn,
  Circle,
  Clapperboard,
  Diamond,
  DollarSign,
  Dumbbell,
  Feather,
  FlaskConical,
  Flower2,
  Folder,
  Globe,
  GraduationCap,
  Heart,
  Hexagon,
  Moon,
  Music,
  Palette,
  PawPrint,
  Pencil,
  Plane,
  Scale,
  Settings,
  Sparkles,
  Sprout,
  Square,
  Stethoscope,
  Trash2,
  Triangle,
  Weight,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { Input } from "@/components/ui/field";
import { msg, useT } from "@/i18n";
import { cn } from "@/lib/cn";

type IconItem = { id: string; Icon: LucideIcon; label: string; keywords: string };

/** The grid in the picker, in the same order as the reference. */
export const WORKSPACE_ICONS: IconItem[] = [
  { id: "folder", Icon: Folder, label: "Folder", keywords: "folder file" },
  { id: "dollar", Icon: DollarSign, label: "Dollar", keywords: "dollar money finance" },
  { id: "book", Icon: Book, label: "Book", keywords: "book read" },
  { id: "graduate", Icon: GraduationCap, label: "Graduation cap", keywords: "graduate school learn" },
  { id: "pencil", Icon: Pencil, label: "Pencil", keywords: "pencil write edit" },
  { id: "feather", Icon: Feather, label: "Feather", keywords: "feather pen write" },
  { id: "braces", Icon: Braces, label: "Braces", keywords: "braces code" },
  { id: "clapper", Icon: Clapperboard, label: "Clapperboard", keywords: "clapper video film" },
  { id: "music", Icon: Music, label: "Music", keywords: "music audio" },
  { id: "trash", Icon: Trash2, label: "Trash", keywords: "trash delete" },
  { id: "x", Icon: X, label: "X", keywords: "x close" },
  { id: "palette", Icon: Palette, label: "Palette", keywords: "palette art color" },
  { id: "stethoscope", Icon: Stethoscope, label: "Stethoscope", keywords: "stethoscope health medical" },
  { id: "settings", Icon: Settings, label: "Settings", keywords: "settings gear" },
  { id: "flower", Icon: Flower2, label: "Flower", keywords: "flower" },
  { id: "briefcase", Icon: Briefcase, label: "Briefcase", keywords: "briefcase work" },
  { id: "chart", Icon: ChartColumn, label: "Chart", keywords: "chart graph" },
  { id: "weight", Icon: Weight, label: "Weight", keywords: "weight" },
  { id: "dumbbell", Icon: Dumbbell, label: "Dumbbell", keywords: "dumbbell gym" },
  { id: "apple", Icon: Apple, label: "Apple", keywords: "apple food" },
  { id: "scale", Icon: Scale, label: "Scale", keywords: "scale law justice" },
  { id: "access", Icon: Accessibility, label: "Accessibility", keywords: "access person" },
  { id: "plane", Icon: Plane, label: "Plane", keywords: "plane travel" },
  { id: "globe", Icon: Globe, label: "Globe", keywords: "globe world" },
  { id: "wrench", Icon: Wrench, label: "Wrench", keywords: "wrench tool" },
  { id: "paw", Icon: PawPrint, label: "Paw", keywords: "paw pet" },
  { id: "flask", Icon: FlaskConical, label: "Flask", keywords: "flask lab science" },
  { id: "brain", Icon: Brain, label: "Brain", keywords: "brain" },
  { id: "heart", Icon: Heart, label: "Heart", keywords: "heart" },
  { id: "sprout", Icon: Sprout, label: "Sprout", keywords: "sprout plant" },
];

/** Older geometric picks still render. They are not in the grid. */
const EXTRA: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  diamond: Diamond,
  circle: Circle,
  triangle: Triangle,
  square: Square,
  hexagon: Hexagon,
  asterisk: Asterisk,
  moon: Moon,
};

const LEGACY: Record<string, string> = {
  "✦": "sparkles",
  "◆": "diamond",
  "●": "circle",
  "▲": "triangle",
  "■": "square",
  "⬢": "hexagon",
  "✳": "asterisk",
  "☾": "moon",
};

export const WORKSPACE_ICON_COLORS = [
  { id: "neutral", label: msg("White"), swatch: "#f4f4f5", ink: "var(--fg)", soft: "color-mix(in oklch, var(--fg) 12%, transparent)" },
  { id: "red", label: msg("Red"), swatch: "oklch(0.67 0.2 25)", ink: "oklch(0.67 0.2 25)", soft: "color-mix(in oklch, oklch(0.67 0.2 25) 18%, transparent)" },
  { id: "orange", label: msg("Orange"), swatch: "oklch(0.72 0.17 55)", ink: "oklch(0.72 0.17 55)", soft: "color-mix(in oklch, oklch(0.72 0.17 55) 18%, transparent)" },
  { id: "yellow", label: msg("Yellow"), swatch: "oklch(0.84 0.15 95)", ink: "oklch(0.62 0.14 95)", soft: "color-mix(in oklch, oklch(0.84 0.15 95) 28%, transparent)" },
  { id: "green", label: msg("Green"), swatch: "oklch(0.72 0.16 145)", ink: "oklch(0.7 0.16 145)", soft: "color-mix(in oklch, oklch(0.72 0.16 145) 18%, transparent)" },
  { id: "blue", label: msg("Blue"), swatch: "oklch(0.65 0.15 250)", ink: "oklch(0.65 0.15 250)", soft: "color-mix(in oklch, oklch(0.65 0.15 250) 18%, transparent)" },
  { id: "purple", label: msg("Purple"), swatch: "oklch(0.64 0.18 300)", ink: "oklch(0.64 0.18 300)", soft: "color-mix(in oklch, oklch(0.64 0.18 300) 18%, transparent)" },
  { id: "pink", label: msg("Pink"), swatch: "oklch(0.7 0.16 350)", ink: "oklch(0.7 0.16 350)", soft: "color-mix(in oklch, oklch(0.7 0.16 350) 18%, transparent)" },
] as const;

export type WorkspaceIconColor = (typeof WORKSPACE_ICON_COLORS)[number]["id"];

const COLOR_IDS = new Set<string>(WORKSPACE_ICON_COLORS.map((c) => c.id));

export function parseWorkspaceIcon(icon?: string | null): { id: string; color: WorkspaceIconColor } {
  const fallback = { id: "diamond", color: "neutral" as WorkspaceIconColor };
  if (!icon) return fallback;
  const legacy = LEGACY[icon];
  if (legacy) return { id: legacy, color: "neutral" };
  const [maybeColor, maybeId] = icon.split(":");
  if (maybeId && COLOR_IDS.has(maybeColor) && (WORKSPACE_ICONS.some((item) => item.id === maybeId) || EXTRA[maybeId])) {
    return { id: maybeId, color: maybeColor as WorkspaceIconColor };
  }
  if (WORKSPACE_ICONS.some((item) => item.id === icon) || EXTRA[icon]) return { id: icon, color: "neutral" };
  return fallback;
}

export function workspaceIconValue(color: string, id: string): string {
  return `${color}:${id}`;
}

export function workspaceIconTone(icon?: string | null): { ink: string; soft: string } {
  const { color } = parseWorkspaceIcon(icon);
  return WORKSPACE_ICON_COLORS.find((item) => item.id === color) ?? WORKSPACE_ICON_COLORS[0]!;
}

function iconComponent(id: string): LucideIcon {
  return WORKSPACE_ICONS.find((item) => item.id === id)?.Icon ?? EXTRA[id] ?? Diamond;
}

export function WorkspaceIcon({ icon, className }: { icon?: string | null; className?: string }) {
  const parsed = parseWorkspaceIcon(icon);
  const Icon = iconComponent(parsed.id);
  const { ink } = workspaceIconTone(icon);
  return <Icon className={className} style={{ color: ink }} aria-hidden />;
}

/** Search, a color row, and an outline-icon grid. */
export function WorkspaceIconPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const selected = parseWorkspaceIcon(value);
  const tone = workspaceIconTone(value);
  const q = query.trim().toLowerCase();
  const extra = EXTRA[selected.id] && !WORKSPACE_ICONS.some((item) => item.id === selected.id)
    ? [{ id: selected.id, Icon: EXTRA[selected.id]!, label: selected.id, keywords: selected.id }]
    : [];
  const shown = [...extra, ...WORKSPACE_ICONS].filter((item) => !q || `${item.label} ${item.keywords}`.toLowerCase().includes(q));

  return (
    <div className="w-full rounded-xl border border-border bg-surface-2 p-2.5">
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Search icons")} aria-label={t("Search icons")} className="h-8 bg-bg" />
      <div className="mt-2.5 grid grid-cols-8">
        {WORKSPACE_ICON_COLORS.map((color) => {
          const on = selected.color === color.id;
          return (
            <div key={color.id} className="flex h-8 items-center justify-center">
              <button
                type="button"
                aria-label={t(color.label)}
                aria-pressed={on}
                onClick={() => onChange(workspaceIconValue(color.id, selected.id))}
                className="size-5 rounded-full"
                style={{
                  background: color.swatch,
                  boxShadow: on
                    ? "0 0 0 2px var(--surface-2), 0 0 0 3.5px var(--fg)"
                    : color.id === "neutral"
                      ? "inset 0 0 0 1px color-mix(in oklab, var(--fg) 25%, transparent)"
                      : undefined,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 grid grid-cols-8 gap-0.5">
        {shown.map((item) => {
          const on = item.id === selected.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-label={item.label}
              aria-pressed={on}
              onClick={() => onChange(workspaceIconValue(selected.color, item.id))}
              className={cn(
                "flex aspect-square items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-surface hover:text-fg",
                on && "bg-surface text-fg",
              )}
              style={on ? { color: tone.ink, background: tone.soft } : undefined}
            >
              <item.Icon className="size-4" />
            </button>
          );
        })}
      </div>
      {shown.length === 0 && <p className="px-1 py-4 text-center text-[12px] text-fg-subtle">{t("No icons match.")}</p>}
    </div>
  );
}

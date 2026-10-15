"use client";

import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { Me, PublicStatus } from "@/lib/types";
import manifest from "./manifest.json";

/**
 * The product's generated images (design/image-prompts.md, made by scripts/generate-images.mjs).
 * Each has a dark and a light variant; the one for the current theme is shown. They're decorative, so
 * screen readers skip them, and admins can turn them off (Admin → Settings → Illustrations).
 */
export type ArtName =
  | "landing-hero" | "landing-chat" | "landing-work" | "landing-code" | "landing-steps" | "landing-cta"
  | "auth-panel" | "auth-setup"
  | "empty-documents" | "empty-projects" | "empty-project-chats" | "empty-work" | "empty-skills" | "empty-connections"
  | "empty-schedules" | "empty-code" | "empty-inbox" | "empty-models" | "empty-groups" | "health-ok" | "license-none"
  | "not-found" | "error" | "offline";

type Entry = { src: string; width: number; height: number; widths: number[]; variants: string[] };
const ART = manifest as Record<string, Entry>;

/** Off when the organization turned illustrations off; the landing page always shows them. */
export function useIllustrations() {
  // Read from the queries the app and the sign-in pages already make; this never fetches by itself.
  const me = useQuery<Me>({ queryKey: ["me"], enabled: false });
  const status = useQuery<PublicStatus>({ queryKey: ["public-status"], enabled: false });
  return (me.data?.org.illustrations ?? status.data?.org.illustrations) !== false;
}

/** Whether <Art name> will show something (so callers can keep their icon otherwise). */
export function useArt(name: ArtName | undefined, always = false) {
  const enabled = useIllustrations();
  return !!name && !!ART[name] && (always || enabled);
}

const FADES = {
  none: "",
  radial: "art-fade-radial",
  edges: "art-fade-edges",
  bottom: "art-fade-bottom",
};

export function Art({
  name,
  className,
  sizes = "100vw",
  fit = "contain",
  fade = "none",
  eager,
  always,
}: {
  name: ArtName;
  className?: string;
  /** The `sizes` attribute: how wide it's shown, so the browser picks the 1× or 2× file. */
  sizes?: string;
  fit?: "contain" | "cover";
  /** Fade the edges into whatever is behind the image. */
  fade?: keyof typeof FADES;
  /** Load straight away (above the fold) instead of when scrolled near. */
  eager?: boolean;
  /** Show even when the organization turned illustrations off (the public site). */
  always?: boolean;
}) {
  const show = useArt(name, always);
  const art = ART[name];
  if (!show || !art) return null;
  const largest = art.widths[art.widths.length - 1];
  return (
    <span aria-hidden className={cn("relative block select-none", className)}>
      {art.variants.map((v) => (
        // Static files with their own 1× and 2× sizes; next/image would only add a resizing server.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={v}
          src={`${art.src}-${v}-${largest}.webp`}
          srcSet={art.widths.map((w) => `${art.src}-${v}-${w}.webp ${w}w`).join(", ")}
          sizes={sizes}
          alt=""
          width={art.width}
          height={art.height}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          className={cn(
            "size-full",
            fit === "cover" ? "object-cover" : "object-contain",
            FADES[fade],
            art.variants.length > 1 && (v === "dark" ? "hidden dark:block" : "dark:hidden"),
          )}
        />
      ))}
    </span>
  );
}

/** <Art>, or `fallback` (usually the icon it replaces) when there's no picture to show. */
export function ArtOr({ fallback, ...props }: Parameters<typeof Art>[0] & { fallback: ReactNode }) {
  return useArt(props.name, props.always) ? <Art {...props} /> : <>{fallback}</>;
}

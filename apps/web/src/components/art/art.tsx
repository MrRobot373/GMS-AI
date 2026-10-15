"use client";

import { useQuery } from "@tanstack/react-query";
import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { Me, PublicStatus } from "@/lib/types";
import manifest from "./manifest.json";

/**
 * The product's generated images (design/image-prompts.md, made by scripts/generate-images.mjs).
 * Each has a dark and a light variant; the one for the current theme is shown. Each is a grey picture
 * plus an accent layer painted in the organization's accent colour, so the pictures follow its branding.
 * They're decorative, so screen readers skip them, and admins can turn them off (Admin → Settings →
 * Illustrations).
 */
export type ArtName =
  | "landing-hero" | "landing-chat" | "landing-work" | "landing-code" | "landing-steps" | "landing-cta"
  | "auth-panel" | "auth-setup"
  | "empty-documents" | "empty-projects" | "empty-project-chats" | "empty-work" | "empty-skills" | "empty-connections"
  | "empty-schedules" | "empty-code" | "empty-inbox" | "empty-models" | "empty-groups" | "health-ok" | "license-none"
  | "not-found" | "error" | "offline";

type Entry = { src: string; width: number; height: number; widths: number[]; variants: string[]; accent?: boolean };
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
  position = "center",
  accentStrength = 1,
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
  /** Which part stays in view when it's cropped (`fit="cover"`), as CSS object-position. */
  position?: string;
  /** How strongly the accent shows (0–1): softer behind text. */
  accentStrength?: number;
  /** Load straight away (above the fold) instead of when scrolled near. */
  eager?: boolean;
  /** Show even when the organization turned illustrations off (the public site). */
  always?: boolean;
}) {
  const show = useArt(name, always);
  const art = ART[name];
  if (!show || !art) return null;
  const largest = art.widths[art.widths.length - 1];
  const toggle = (v: string) => art.variants.length > 1 && (v === "dark" ? "hidden dark:block" : "dark:hidden");
  return (
    // .art (globals.css) sets display and position in a lower layer, so the caller's classes win.
    <span aria-hidden className={cn("art select-none", FADES[fade], className)}>
      {art.variants.map((v) => (
        <Fragment key={v}>
          {/* Static files with their own 1× and 2× sizes; next/image would only add a resizing server. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${art.src}-${v}-${largest}.webp`}
            srcSet={art.widths.map((w) => `${art.src}-${v}-${w}.webp ${w}w`).join(", ")}
            sizes={sizes}
            alt=""
            width={art.width}
            height={art.height}
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            draggable={false}
            style={{ objectPosition: position }}
            className={cn("size-full", fit === "cover" ? "object-cover" : "object-contain", toggle(v))}
          />
          {art.accent && (
            // The accent layer: the organization's accent colour, through the picture's accent shapes.
            <span
              className={cn("art-accent", toggle(v))}
              style={{
                maskImage: `url(${art.src}-${v}-accent.webp)`,
                WebkitMaskImage: `url(${art.src}-${v}-accent.webp)`,
                maskSize: fit,
                WebkitMaskSize: fit,
                maskPosition: position,
                WebkitMaskPosition: position,
                opacity: accentStrength,
              }}
            />
          )}
        </Fragment>
      ))}
    </span>
  );
}

/** <Art>, or `fallback` (usually the icon it replaces) when there's no picture to show. */
export function ArtOr({ fallback, ...props }: Parameters<typeof Art>[0] & { fallback: ReactNode }) {
  return useArt(props.name, props.always) ? <Art {...props} /> : <>{fallback}</>;
}

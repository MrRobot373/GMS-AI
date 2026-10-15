"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Art, type ArtName } from "@/components/art/art";
import { usePublicStatus } from "@/components/auth-shell";
import { OrgLogo } from "@/components/org-logo";
import { useT } from "@/i18n";

/** A full-page message (not found, an error) in the product's look, with its picture. */
export function SystemPage({ art, eyebrow, title, children, actions }: { art: ArtName; eyebrow?: string; title: string; children?: ReactNode; actions?: ReactNode }) {
  const t = useT();
  const { data } = usePublicStatus();
  const product = data?.org.productName ?? "Aatmiq";
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-bg px-4 py-12 text-center">
      <Link href="/" className="mb-6 flex items-center gap-2" aria-label={t("{product} home", { product })}>
        <OrgLogo src={data?.org.logoUrl} className="size-7" />
        <span className="text-[14px] text-fg">{data?.org.name || product}</span>
      </Link>
      <Art name={art} className="aspect-[3/2] w-full max-w-[520px]" sizes="(min-width: 560px) 520px, 92vw" fade="edges" eager />
      {eyebrow && <p className="mt-2 font-mono text-[12px] tracking-[0.12em] text-fg-subtle uppercase">{eyebrow}</p>}
      <h1 className="mt-3 max-w-xl font-serif text-[34px] leading-tight tracking-[-0.02em] text-fg">{title}</h1>
      {children && <div className="mt-2 max-w-md text-sm leading-relaxed text-fg-muted">{children}</div>}
      {actions && <div className="mt-7 flex flex-wrap items-center justify-center gap-2">{actions}</div>}
    </main>
  );
}

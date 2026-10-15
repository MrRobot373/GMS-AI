"use client";

import type { ComponentProps } from "react";
import { EmptyState as Base } from "@aatmiq/ui/misc";
import { Art, useArt, type ArtName } from "@/components/art/art";

/** The shared empty state, with one of the generated pictures instead of the icon when there is one. */
export function EmptyState({ art, ...props }: ComponentProps<typeof Base> & { art?: ArtName }) {
  const show = useArt(art);
  return <Base {...props} media={show && art ? <Art name={art} className="size-40" sizes="160px" fade="radial" /> : undefined} />;
}

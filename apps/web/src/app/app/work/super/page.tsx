"use client";

import { Suspense } from "react";
import { WorkHome } from "@/components/work/work-home";

/** Super AI: the same page as Work AI's, on the Claude Code engine (docs/20-super-ai.md). */
export default function SuperAiPage() {
  return (
    <Suspense>
      <WorkHome engine="claude" />
    </Suspense>
  );
}

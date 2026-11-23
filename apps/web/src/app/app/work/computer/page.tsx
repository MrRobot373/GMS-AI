"use client";

import { Suspense } from "react";
import { WorkHome } from "@/components/work/work-home";

/** Computer AI: the same page as Work AI's, for tasks on this computer's screen (docs/23-computer-ai.md). */
export default function ComputerAiPage() {
  return (
    <Suspense>
      <WorkHome engine="computer" />
    </Suspense>
  );
}

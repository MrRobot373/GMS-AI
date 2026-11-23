"use client";

import { Suspense } from "react";
import { WorkHome } from "@/components/work/work-home";

/** Agent AI: the same page as Work AI's, on the opencode engine (docs/22-agent-ai.md). */
export default function AgentAiPage() {
  return (
    <Suspense>
      <WorkHome engine="opencode" />
    </Suspense>
  );
}

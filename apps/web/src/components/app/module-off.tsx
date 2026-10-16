"use client";

import { TopBar } from "@/components/app/frame";
import { EmptyState } from "@/components/ui/misc";
import { useT } from "@/i18n";

/** A GEM AI module that's switched off for the organization or for this person. */
export function ModuleOff() {
  const t = useT();
  return (
    <div className="flex h-full flex-col">
      <TopBar title="" />
      <EmptyState className="flex-1" title={t("This module isn't available to you")} description={t("Your admin can switch it on for you, or for the organization, in the Admin console.")} />
    </div>
  );
}

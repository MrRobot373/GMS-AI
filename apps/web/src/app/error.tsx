"use client";

import Link from "next/link";
import { useEffect } from "react";
import { SystemPage } from "@/components/system/system-page";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";

/** Shown when a page crashes; the rest of the app keeps working. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  useEffect(() => console.error(error), [error]);
  return (
    <SystemPage
      art="error"
      title={t("Something went wrong")}
      actions={
        <>
          <Button variant="primary" onClick={reset}>
            {t("Try again")}
          </Button>
          <Button asChild variant="outline">
            <Link href="/app">{t("Go to the start page")}</Link>
          </Button>
        </>
      }
    >
      <p>{t("This page couldn't load. Try again, and if it keeps happening, tell your admin.")}</p>
      {error.digest && <p className="mt-3 font-mono text-[11.5px] text-fg-subtle">{t("Reference: {digest}", { digest: error.digest })}</p>}
    </SystemPage>
  );
}

"use client";

import Link from "next/link";
import { SystemPage } from "@/components/system/system-page";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";

export default function NotFound() {
  const t = useT();
  return (
    <SystemPage
      art="not-found"
      eyebrow="404"
      title={t("This page doesn't exist")}
      actions={
        <Button asChild variant="primary">
          <Link href="/app">{t("Go to the start page")}</Link>
        </Button>
      }
    >
      {t("The link may be old, or the page was moved or deleted.")}
    </SystemPage>
  );
}

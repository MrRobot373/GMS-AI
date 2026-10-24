"use client";

import { PageHeader } from "@/components/app/page-header";
import { ADMIN_FAQ } from "@/components/help/admin-faq";
import { FaqList } from "@/components/help/faq-list";
import { useSession } from "@/components/app/session";
import { useT } from "@/i18n";

export default function AdminFaqPage() {
  const t = useT();
  const { me } = useSession();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t("FAQ")}
        description={t("Answers for running {org}: people, models, budgets, Work AI and the server.", { org: me.org.name })}
      />
      <div className="mt-8">
        <FaqList sections={ADMIN_FAQ} />
      </div>
    </div>
  );
}

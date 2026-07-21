"use client";

import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { AdminTabs } from "@/components/AdminTabs";
import { useTabParam } from "@/hooks/useTabParam";
import { supportTabs } from "./_lib/types";
import { TicketsTab } from "./_components/TicketsTab";
import { GuestContactsTab } from "./_components/GuestContactsTab";
import { useTranslations } from "next-intl";

export default function SupportPage() {
  const t = useTranslations();
  const [tab, setTab] = useTabParam("tickets");

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.messaging.support.title")}
        description={t("admin.messaging.support.subtitle")}
      />
      <AdminTabs tabs={supportTabs(t)} value={tab} onChange={setTab} />

      {tab === "guest" ? <GuestContactsTab /> : <TicketsTab />}
    </AdminPage>
  );
}

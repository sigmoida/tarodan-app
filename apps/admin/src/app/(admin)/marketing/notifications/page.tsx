"use client";

import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { AdminTabs } from "@/components/AdminTabs";
import { useTabParam } from "@/hooks/useTabParam";
import { notificationTabs } from "./_lib/types";
import { SendNotificationForm } from "./_components/SendNotificationForm";
import { ScheduledTab } from "./_components/ScheduledTab";
import { HistoryTab } from "./_components/HistoryTab";
import { useTranslations } from "next-intl";

export default function NotificationsPage() {
  const t = useTranslations();
  const [tab, setTab] = useTabParam("send");

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.marketing.notifications.title")}
        description={t("admin.marketing.notifications.subtitle")}
      />
      <AdminTabs tabs={notificationTabs(t)} value={tab} onChange={setTab} />

      {tab === "scheduled" ? (
        <ScheduledTab />
      ) : tab === "history" ? (
        <HistoryTab />
      ) : (
        <SendNotificationForm onScheduled={() => setTab("scheduled")} />
      )}
    </AdminPage>
  );
}

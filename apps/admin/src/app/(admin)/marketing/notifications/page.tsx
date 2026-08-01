"use client";

import { useState } from "react";
import { Button } from "@tarodan/ui";
import { PlusIcon } from "@heroicons/react/24/outline";
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
  const [tab, setTab] = useTabParam("scheduled");
  // Oluşturma bir sekme DEĞİL: route açılınca modal kendiliğinden açılmaz,
  // başlıktaki buton açar (key'siz mount → her açılışta temiz form).
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.marketing.notifications.title")}
        description={t("admin.marketing.notifications.subtitle")}
      >
        <Button
          leftIcon={<PlusIcon className="h-4 w-4" />}
          onClick={() => setCreateOpen(true)}
        >
          {t("admin.marketing.notifications.createNew")}
        </Button>
      </PageHeader>
      <AdminTabs tabs={notificationTabs(t)} value={tab} onChange={setTab} />

      {tab === "history" ? <HistoryTab /> : <ScheduledTab />}

      {createOpen && (
        <SendNotificationForm
          onClose={() => setCreateOpen(false)}
          onScheduled={() => {
            setCreateOpen(false);
            setTab("scheduled");
          }}
        />
      )}
    </AdminPage>
  );
}

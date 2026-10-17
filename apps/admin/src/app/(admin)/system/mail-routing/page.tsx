"use client";

import { Alert } from "@tarodan/ui";
import { AdminPage } from "@/components/page/AdminPage";
import { QueryErrorCard } from "@/components/page/QueryErrorCard";
import { PageHeader } from "@/components/AdminList";
import { PageLoading } from "@/components/PageLoading";
import { AdminTabs } from "@/components/AdminTabs";
import { useMailRoutingPage } from "./_lib/useMailRoutingPage";
import { AccountsTab } from "./_components/AccountsTab";
import { AreasTab } from "./_components/AreasTab";
import { NotificationsTab } from "./_components/NotificationsTab";

/**
 * E-posta Yönlendirme — her alanın müşteri postasının hangi posta kutusundan
 * gideceği (gönderen hesaplar + alan eşlemesi) ve operasyon olaylarının
 * personele iç bildirim olarak kime, ne sıklıkla ulaşacağı. Tek GET hepsini
 * yükler; değiştirme yalnız super_admin'e açıktır, diğer roller salt okur.
 */
export default function MailRoutingPage() {
  const { t, canEdit, tab, setTab, tabs, query, state } = useMailRoutingPage();

  if (query.isError) {
    return (
      <QueryErrorCard
        title={t("admin.mailRouting.error.title")}
        description={t("admin.mailRouting.error.description")}
        onRetry={() => void query.refetch()}
        isRetrying={query.isRefetching}
      />
    );
  }

  if (query.isLoading || !state) return <PageLoading />;

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.mailRouting.page.title")}
        description={t("admin.mailRouting.page.description")}
      />

      {!canEdit && (
        <Alert variant="info">{t("admin.mailRouting.readOnly")}</Alert>
      )}

      <AdminTabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === "accounts" && <AccountsTab state={state} canEdit={canEdit} />}
      {tab === "areas" && <AreasTab state={state} canEdit={canEdit} />}
      {tab === "notifications" && (
        <NotificationsTab state={state} canEdit={canEdit} />
      )}
    </AdminPage>
  );
}

"use client";

import { Button } from "@tarodan/ui";
import { Form } from "@tarodan/ui/form";
import { AdminPage } from "@/components/page/AdminPage";
import { QueryErrorCard } from "@/components/page/QueryErrorCard";
import { PageHeader } from "@/components/AdminList";
import { PageLoading } from "@/components/PageLoading";
import { ProviderCard } from "./_components/ProviderCard";
import { ReadinessCard } from "./_components/ReadinessCard";
import { SettingsGroupCard } from "./_components/SettingsGroupCard";
import { SyncRecordsCard } from "./_components/SyncRecordsCard";
import { SETTING_GROUPS } from "./_lib/invoicing-settings";
import { useInvoicingSettingsPage } from "./_lib/useInvoicingSettingsPage";

/**
 * Faturalama Ayarları — Netsis'te muhasebenin açtığı kayıtlara bağlı kodlar
 * (perakende cari, e-Arşiv / e-Fatura serisi, ürün satışı ve ücret türü başına
 * hizmet kartı) deploy gerektirmeden buradan değişir. Etkin sağlayıcı ve
 * Netsis modu dağıtım ayarıdır, burada yalnız gösterilir.
 */
export default function InvoicingSettingsPage() {
  const { t, query, state, form, save, submit, ping, pingResult } =
    useInvoicingSettingsPage();

  if (query.isError) {
    return (
      <QueryErrorCard
        title={t("admin.invoicingSettings.error.title")}
        description={t("admin.invoicingSettings.error.description")}
        onRetry={() => void query.refetch()}
        isRetrying={query.isRefetching}
      />
    );
  }

  if (query.isLoading || !state) return <PageLoading />;

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.invoicingSettings.page.title")}
        description={t("admin.invoicingSettings.page.description")}
      />

      <ProviderCard
        state={state}
        onPing={() => ping.mutate(undefined)}
        isPinging={ping.isPending}
        pingResult={pingResult}
      />

      <Form form={form} onSubmit={submit} className="space-y-4">
        {SETTING_GROUPS.map((group) => (
          <SettingsGroupCard key={group} group={group} state={state} />
        ))}
        <div className="flex justify-end">
          <Button type="submit" isLoading={save.isPending}>
            {t("admin.invoicingSettings.saveButton")}
          </Button>
        </div>
      </Form>

      <ReadinessCard state={state} />

      <SyncRecordsCard />
    </AdminPage>
  );
}

"use client";

import { useTranslations } from "next-intl";
import { Alert } from "@tarodan/ui";
import { PageHeader } from "@/components/AdminList";
import { PageLoading } from "@/components/PageLoading";
import { SectionCard } from "@/components/detail/SectionCard";
import { AdminPage } from "@/components/page/AdminPage";
import { ForbiddenScreen } from "@/components/page/ForbiddenScreen";
import { QueryErrorCard } from "@/components/page/QueryErrorCard";
import { useSession } from "@/context/SessionContext";
import { isForbiddenError } from "@/lib/error";
import { useInstallmentSettings } from "./_hooks/useInstallmentSettings";
import { useInstallmentRules } from "./_hooks/useInstallmentRules";
import { InstallmentGeneralCard } from "./_components/InstallmentGeneralCard";
import { InstallmentPreview } from "./_components/InstallmentPreview";
import { InstallmentRatesCard } from "./_components/InstallmentRatesCard";
import { InstallmentRulesSection } from "./_components/InstallmentRulesSection";

const L = "admin.finance.installments";

/**
 * Finance > Installments (ADR 0019): the kill switch and minimum amount,
 * the latest PayTR rate snapshot, the segment rules and the price preview.
 * Everyone with the page reads it; only super_admin writes (the API refuses
 * other roles anyway). A role the API refuses (403) sees the forbidden page.
 */
export default function InstallmentsPage() {
  const t = useTranslations();
  const { user } = useSession();
  const canEdit = user.role === "super_admin";
  const settings = useInstallmentSettings();
  const rules = useInstallmentRules();

  if (settings.isError) {
    if (isForbiddenError(settings.error)) return <ForbiddenScreen />;
    return (
      <QueryErrorCard
        title={t(`${L}.error.title`)}
        description={t(`${L}.error.description`)}
        onRetry={() => void settings.refetch()}
        isRetrying={settings.isRefetching}
      />
    );
  }
  if (!settings.data) return <PageLoading />;
  const { rates } = settings.data;

  return (
    <AdminPage>
      <PageHeader title={t(`${L}.title`)} description={t(`${L}.subtitle`)} />
      {!canEdit && <Alert variant="info">{t(`${L}.readOnly`)}</Alert>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <InstallmentGeneralCard settings={settings.data} canEdit={canEdit} />
        <InstallmentRatesCard rates={rates} />
      </div>

      <InstallmentRulesSection
        rulesQuery={rules}
        canEdit={canEdit}
        rates={rates}
      />

      <SectionCard title={t(`${L}.preview.title`)} bodyClassName="space-y-3">
        <p className="text-sm text-muted">{t(`${L}.preview.description`)}</p>
        <InstallmentPreview rates={rates} rules={rules.data ?? []} />
      </SectionCard>
    </AdminPage>
  );
}

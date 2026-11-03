"use client";

import { useTranslations } from "next-intl";
import { Alert } from "@tarodan/ui";
import { PageHeader } from "@/components/AdminList";
import { AdminPage } from "@/components/page/AdminPage";
import { EnvironmentBadge } from "./_components/EnvironmentBadge";
import { LabError, LabLoading } from "./_components/LabResultState";
import { SellerTrustLabBody } from "./_components/SellerTrustLabBody";
import { useLabParams } from "./_lib/useSellerTrustLab";

export default function SellerTrustLabPage() {
  const t = useTranslations();
  const params = useLabParams();
  const env = params.data?.environment;

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.system.sellerTrustLab.title")}
        description={t("admin.nav.items.sellerTrustLab.description")}
      >
        {env && <EnvironmentBadge environment={env} />}
      </PageHeader>

      <Alert variant="info">
        {t("admin.system.sellerTrustLab.readOnlyNotice")}
      </Alert>
      <Alert variant="info">
        {t("admin.system.sellerTrustLab.auditNotice")}
      </Alert>
      {env?.isProd && (
        <Alert variant="danger">
          {t("admin.system.sellerTrustLab.prodWarning")}
        </Alert>
      )}

      {params.isLoading && <LabLoading />}
      {params.isError && (
        <LabError error={params.error} onRetry={() => void params.refetch()} />
      )}
      {params.data && <SellerTrustLabBody v1={params.data.v1} />}
    </AdminPage>
  );
}

"use client";

import { Alert, Badge } from "@tarodan/ui";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { CronsCard } from "./_components/CronsCard";
import { TimeAdjustCard } from "./_components/TimeAdjustCard";
import { useTestToolsPage } from "./_lib/useTestToolsPage";
import { useTranslations } from "next-intl";

export default function TestToolsPage() {
  const t = useTranslations();
  const { data: env } = useTestToolsPage();

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.system.testTools.title")}
        description={t("admin.system.testTools.description")}
      >
        {env && (
          <Badge variant={env.isProd ? "danger" : "secondary"}>
            {env.isProd ? "⚠ PROD" : env.env}
          </Badge>
        )}
      </PageHeader>

      {env?.isProd && (
        <Alert variant="danger">
          {t("admin.system.testTools.prodWarningBefore")}{" "}
          <b>{t("admin.system.testTools.realCustomerData")}</b>{" "}
          {t("admin.system.testTools.prodWarningAfter")}
        </Alert>
      )}

      <CronsCard />
      <TimeAdjustCard isProd={!!env?.isProd} />
    </AdminPage>
  );
}

"use client";

import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { AdminTabs } from "@/components/AdminTabs";
import { useTabParam } from "@/hooks/useTabParam";
import { taxTabs } from "./_lib/types";
import { VatTab } from "./_components/VatTab";
import { WithholdingTab } from "./_components/WithholdingTab";
import { TaxReportTab } from "./_components/TaxReportTab";
import { useTranslations } from "next-intl";

export default function TaxPage() {
  const t = useTranslations();
  const [tab, setTab] = useTabParam("kdv");

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.finance.tax.title")}
        description={t("admin.finance.tax.subtitle")}
      />
      <AdminTabs tabs={taxTabs(t)} value={tab} onChange={setTab} />

      {tab === "withholding" ? (
        <WithholdingTab />
      ) : tab === "report" ? (
        <TaxReportTab />
      ) : (
        <VatTab />
      )}
    </AdminPage>
  );
}

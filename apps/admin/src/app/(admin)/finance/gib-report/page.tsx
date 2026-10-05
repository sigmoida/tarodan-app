/** @format */

"use client";

import { useTranslations } from "next-intl";
import type { AdminGibReportRow } from "@tarodan/types";
import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { DeepLinkFilterSummary } from "@/components/list/DeepLinkFilterSummary";
import { gibReportFilterFields } from "./_lib/filters";
import { GibReportTable } from "./_components/GibReportTable";
import { GibReportExportButton } from "./_components/GibReportExportButton";

/**
 * GİB İlan ve Satıcı Raporu — vergi idaresinin talep etmesi beklenen ilan ve
 * satıcı verisi. Satır = ilanın BUGÜNKÜ hâli (geçmiş tutulmaz); alan
 * kaynakları ve bilinen boşluklar docs/GIB_REPORT.md'de.
 */
export default function GibReportPage() {
  const t = useTranslations();

  return (
    <ResourceList<AdminGibReportRow>
      resource="gib-report"
      fetcher={(params) => adminApi.getGibReport(params)}
      getRowId={(row) => row.productId}
      syncUrl
      filters={gibReportFilterFields(t)}
    >
      <ResourceList.Header
        title={t("admin.gibReport.title")}
        description={
          <>
            {t("admin.gibReport.description")}{" "}
            <DeepLinkFilterSummary
              totalLabel={(count) => t("admin.gibReport.totalCount", { count })}
            />
          </>
        }
      />
      <ResourceList.Toolbar searchPlaceholder={t("admin.gibReport.search")}>
        <GibReportExportButton />
      </ResourceList.Toolbar>
      <GibReportTable />
      <ResourceList.Pagination />
    </ResourceList>
  );
}

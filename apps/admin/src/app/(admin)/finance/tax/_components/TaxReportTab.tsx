"use client";

import { Input, Select } from "@tarodan/ui";
import {
  CurrencyDollarIcon,
  ChartBarIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";
import { adminApi } from "@/lib/api";
import { ResourceList, useResourceList } from "@/components/list";
import { SectionCard } from "@/components/detail/SectionCard";
import { MetricCard } from "@/components/MetricCard";
import { fmtTry } from "@/lib/format";
import { taxReportColumns } from "../_lib/columns";
import { type TaxReport, groupByOptions } from "../_lib/types";
import { useTranslations } from "next-intl";

type TaxReportRow = TaxReport["breakdown"][number];
type TaxReportListData = {
  data: TaxReportRow[];
  meta: { total: number };
  summary: TaxReport["summary"];
};

const start = new Date();
start.setFullYear(start.getFullYear() - 1);
const INITIAL_FILTERS = {
  fromDate: start.toISOString().slice(0, 10),
  toDate: new Date().toISOString().slice(0, 10),
  groupBy: "month",
};

const taxReportFetcher = async (params: Record<string, any>) => {
  const response = await adminApi.getTaxReport({
    fromDate: params.fromDate ?? INITIAL_FILTERS.fromDate,
    toDate: params.toDate ?? INITIAL_FILTERS.toDate,
    groupBy: params.groupBy ?? INITIAL_FILTERS.groupBy,
  });
  const report = response.data as TaxReport;
  const rows = report?.breakdown ?? [];
  return {
    ...response,
    data: {
      data: rows,
      meta: { total: rows.length },
      summary: report?.summary,
    },
  };
};

function TaxReportControls() {
  const t = useTranslations();
  const { filters, setFilter } = useResourceList<TaxReportRow>();
  return (
    <SectionCard>
      <div className="flex flex-wrap items-end gap-4">
        <Input
          type="date"
          label={t("admin.finance.common.start")}
          value={filters.fromDate ?? INITIAL_FILTERS.fromDate}
          onChange={(event) => setFilter("fromDate", event.target.value)}
        />
        <Input
          type="date"
          label={t("admin.finance.common.end")}
          value={filters.toDate ?? INITIAL_FILTERS.toDate}
          onChange={(event) => setFilter("toDate", event.target.value)}
        />
        <Select
          label={t("admin.finance.tax.groupByLabel")}
          value={filters.groupBy ?? INITIAL_FILTERS.groupBy}
          onChange={(event) => setFilter("groupBy", event.target.value)}
          options={groupByOptions(t)}
        />
      </div>
    </SectionCard>
  );
}

function TaxReportSummary() {
  const t = useTranslations();
  const { data } = useResourceList<TaxReportRow>();
  const summary = (data as TaxReportListData)?.summary;
  if (!summary) return null;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <MetricCard
        icon={CurrencyDollarIcon}
        tone="success"
        label={t("admin.finance.tax.totalTaxCollected")}
        value={fmtTry(summary.totalTaxCollected)}
      />
      <MetricCard
        icon={ChartBarIcon}
        tone="primary"
        label={t("admin.finance.tax.totalRevenue")}
        value={fmtTry(summary.totalRevenue)}
      />
      <MetricCard
        icon={DocumentTextIcon}
        tone="info"
        label={t("admin.finance.tax.invoiceCount")}
        value={summary.invoiceCount}
      />
    </div>
  );
}

export function TaxReportTab() {
  const t = useTranslations();
  return (
    <ResourceList<TaxReportRow>
      resource="tax-report"
      fetcher={taxReportFetcher}
      getRowId={(row) => row.period}
      // Full-load with an explicit cap: the aggregated report is small; 1000
      // rows covers every period. Move server-side if it ever exceeds this (#383).
      limit={1000}
      syncUrl
      initialFilters={INITIAL_FILTERS}
    >
      <TaxReportControls />
      <TaxReportSummary />
      <SectionCard title={t("admin.finance.tax.taxByPeriod")}>
        <ResourceList.Table<TaxReportRow>
          columns={taxReportColumns(t)}
          emptyText={t("admin.finance.tax.noInvoicesForPeriod")}
        />
      </SectionCard>
    </ResourceList>
  );
}

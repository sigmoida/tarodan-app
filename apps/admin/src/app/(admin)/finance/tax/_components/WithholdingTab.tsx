"use client";

import { Button, Input, Select } from "@tarodan/ui";
import {
  ReceiptPercentIcon,
  UsersIcon,
  ArrowsRightLeftIcon,
  ClockIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/outline";
import { adminApi } from "@/lib/api";
import { downloadBlob } from "@/lib/download";
import { ResourceList, useResourceList } from "@/components/list";
import { SectionCard } from "@/components/detail/SectionCard";
import { MetricCard } from "@/components/MetricCard";
import { useRateSetting } from "@/hooks/useRateSetting";
import { fmtTry } from "@/lib/format";
import { paginateClient } from "@/lib/query/client-list";
import { withholdingColumns } from "../_lib/columns";
import { type WithholdingReport, months } from "../_lib/types";
import { useTranslations } from "next-intl";

type WithholdingRow = WithholdingReport["rows"][number];
type WithholdingListData = {
  data: WithholdingRow[];
  meta: { total: number };
  summary: WithholdingReport["summary"];
  period: string;
  allRows: WithholdingRow[];
};

const now = new Date();
const INITIAL_FILTERS = {
  year: String(now.getFullYear()),
  month: String(now.getMonth() + 1),
};

const withholdingFetcher = async (params: Record<string, any>) => {
  const response = await adminApi.getWithholdingReport({
    year: Number(params.year ?? INITIAL_FILTERS.year),
    month: Number(params.month ?? INITIAL_FILTERS.month),
  });
  const report = response.data as WithholdingReport | null;
  const rows = report?.rows ?? [];
  const page = paginateClient(rows, params);
  return {
    ...response,
    data: {
      ...page,
      summary: report?.summary,
      period: report?.period,
      allRows: rows,
    },
  };
};

function WithholdingControls() {
  const t = useTranslations();
  const { filters, setFilter, data } = useResourceList<WithholdingRow>();
  const report = data as WithholdingListData;

  const exportCsv = () => {
    if (!report?.summary || !report.period) return;
    const header = t("admin.finance.tax.csvHeader");
    const lines = (report.allRows ?? []).map((row) =>
      [
        `"${(row.sellerName || "").replace(/"/g, '""')}"`,
        row.taxId ?? "",
        row.email ?? "",
        row.transferCount,
        row.grossAmount.toFixed(2).replace(".", ","),
        row.withholdingTax.toFixed(2).replace(".", ","),
      ].join(";"),
    );
    const total = `"${t("common.total").toLocaleUpperCase(t("common.dateLocale"))}";;;${report.summary.transferCount};;${report.summary.totalWithholding
      .toFixed(2)
      .replace(".", ",")}`;
    downloadBlob(
      t("admin.finance.tax.csvFilename", { period: report.period }),
      "﻿" + [header, ...lines, total].join("\r\n"),
    );
  };

  return (
    <SectionCard>
      <div className="flex flex-wrap items-end gap-4">
        <Select
          label={t("admin.finance.tax.year")}
          value={filters.year ?? INITIAL_FILTERS.year}
          onChange={(event) => setFilter("year", event.target.value)}
          options={Array.from({ length: 4 }, (_, index) => {
            const year = now.getFullYear() - index;
            return { value: String(year), label: String(year) };
          })}
        />
        <Select
          label={t("admin.finance.tax.month")}
          value={filters.month ?? INITIAL_FILTERS.month}
          onChange={(event) => setFilter("month", event.target.value)}
          options={months(t("common.dateLocale")).map((name, index) => ({
            value: String(index + 1),
            label: name,
          }))}
        />
        <Button
          variant="secondary"
          leftIcon={<ArrowDownTrayIcon className="h-5 w-5" />}
          onClick={exportCsv}
          disabled={(report?.allRows?.length ?? 0) === 0}
        >
          {t("admin.finance.common.downloadCsv")}
        </Button>
      </div>
    </SectionCard>
  );
}

function WithholdingSummary() {
  const t = useTranslations();
  const { data } = useResourceList<WithholdingRow>();
  const summary = (data as WithholdingListData)?.summary;
  if (!summary) return null;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      <MetricCard
        icon={ReceiptPercentIcon}
        tone="primary"
        label={t("admin.finance.tax.periodWithholding")}
        value={fmtTry(summary.totalWithholding)}
      />
      <MetricCard
        icon={UsersIcon}
        tone="info"
        label={t("admin.finance.tax.sellerCount")}
        value={summary.sellerCount}
      />
      <MetricCard
        icon={ArrowsRightLeftIcon}
        tone="success"
        label={t("admin.finance.tax.transferCount")}
        value={summary.transferCount}
      />
      <MetricCard
        icon={ClockIcon}
        tone="warning"
        label={t("admin.finance.tax.pendingWithholding")}
        value={fmtTry(summary.pendingWithholding)}
      />
    </div>
  );
}

function WithholdingTable() {
  const t = useTranslations();
  const { data } = useResourceList<WithholdingRow>();
  const period = (data as WithholdingListData)?.period;
  return (
    <SectionCard
      title={t("admin.finance.tax.withholdingBySeller", {
        period: period ? ` — ${period}` : "",
      })}
    >
      <ResourceList.Table<WithholdingRow>
        columns={withholdingColumns(t)}
        emptyText={t("admin.finance.tax.noWithholdingForPeriod")}
      />
    </SectionCard>
  );
}

export function WithholdingTab() {
  const t = useTranslations();
  const {
    value: whRate,
    setValue: setWhRate,
    onSave: onSaveRate,
    isPending: savingRate,
  } = useRateSetting({
    queryKey: "withholding-rate",
    load: async () =>
      (await adminApi.getWithholdingRate()).data?.rate as number | undefined,
    save: (rate) => adminApi.setWithholdingRate(rate),
    successMessage: t("admin.finance.tax.withholdingRateUpdated"),
    fallback: "1",
  });

  return (
    <div className="space-y-6">
      <SectionCard
        title={t("admin.finance.tax.ecommerceWithholding")}
        bodyClassName="space-y-4"
      >
        <p className="text-sm text-muted">
          {t("admin.finance.tax.withholdingDescription")}
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <Input
            type="number"
            min={0}
            max={100}
            step={0.01}
            label={t("admin.finance.tax.withholdingRatePercent")}
            value={whRate}
            onChange={(event) => setWhRate(event.target.value)}
            className="w-32"
          />
          <Button onClick={onSaveRate} isLoading={savingRate}>
            {t("common.save")}
          </Button>
        </div>
      </SectionCard>

      <ResourceList<WithholdingRow>
        resource="withholding-report"
        fetcher={withholdingFetcher}
        getRowId={(row) => row.sellerId}
        syncUrl
        initialFilters={INITIAL_FILTERS}
      >
        <WithholdingControls />
        <ResourceList.Toolbar>
          <ResourceList.Search />
        </ResourceList.Toolbar>
        <WithholdingSummary />
        <WithholdingTable />
        <ResourceList.Pagination />
      </ResourceList>
    </div>
  );
}

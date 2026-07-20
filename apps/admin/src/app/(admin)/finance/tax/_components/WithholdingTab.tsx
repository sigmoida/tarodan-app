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
import { withholdingColumns } from "../_lib/columns";
import { type WithholdingReport, MONTHS } from "../_lib/types";

type WithholdingRow = WithholdingReport["rows"][number];
type WithholdingListData = {
  data: WithholdingRow[];
  meta: { total: number };
  summary: WithholdingReport["summary"];
  period: string;
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
  return {
    ...response,
    data: {
      data: rows,
      meta: { total: rows.length },
      summary: report?.summary,
      period: report?.period,
    },
  };
};

function WithholdingControls() {
  const { filters, setFilter, data, rows } = useResourceList<WithholdingRow>();
  const report = data as WithholdingListData;

  const exportCsv = () => {
    if (!report?.summary || !report.period) return;
    const header =
      "Satıcı;VKN/TCKN;E-posta;Transfer Adedi;Brüt Tutar (TL);Kesilen Stopaj (TL)";
    const lines = rows.map((row) =>
      [
        `"${(row.sellerName || "").replace(/"/g, '""')}"`,
        row.taxId ?? "",
        row.email ?? "",
        row.transferCount,
        row.grossAmount.toFixed(2).replace(".", ","),
        row.withholdingTax.toFixed(2).replace(".", ","),
      ].join(";"),
    );
    const total = `"TOPLAM";;;${report.summary.transferCount};;${report.summary.totalWithholding
      .toFixed(2)
      .replace(".", ",")}`;
    downloadBlob(
      `stopaj-muhtasar-${report.period}.csv`,
      "﻿" + [header, ...lines, total].join("\r\n"),
    );
  };

  return (
    <SectionCard>
      <div className="flex flex-wrap items-end gap-4">
        <Select
          label="Yıl"
          value={filters.year ?? INITIAL_FILTERS.year}
          onChange={(event) => setFilter("year", event.target.value)}
          options={Array.from({ length: 4 }, (_, index) => {
            const year = now.getFullYear() - index;
            return { value: String(year), label: String(year) };
          })}
        />
        <Select
          label="Ay"
          value={filters.month ?? INITIAL_FILTERS.month}
          onChange={(event) => setFilter("month", event.target.value)}
          options={MONTHS.map((name, index) => ({
            value: String(index + 1),
            label: name,
          }))}
        />
        <Button
          variant="secondary"
          leftIcon={<ArrowDownTrayIcon className="h-5 w-5" />}
          onClick={exportCsv}
          disabled={rows.length === 0}
        >
          CSV İndir
        </Button>
      </div>
    </SectionCard>
  );
}

function WithholdingSummary() {
  const { data } = useResourceList<WithholdingRow>();
  const summary = (data as WithholdingListData)?.summary;
  if (!summary) return null;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      <MetricCard
        icon={ReceiptPercentIcon}
        tone="primary"
        label="Dönem Kesilen Stopaj"
        value={fmtTry(summary.totalWithholding)}
      />
      <MetricCard
        icon={UsersIcon}
        tone="info"
        label="Satıcı Sayısı"
        value={summary.sellerCount}
      />
      <MetricCard
        icon={ArrowsRightLeftIcon}
        tone="success"
        label="Transfer Sayısı"
        value={summary.transferCount}
      />
      <MetricCard
        icon={ClockIcon}
        tone="warning"
        label="Bekleyen Stopaj"
        value={fmtTry(summary.pendingWithholding)}
      />
    </div>
  );
}

function WithholdingTable() {
  const { data } = useResourceList<WithholdingRow>();
  const period = (data as WithholdingListData)?.period;
  return (
    <SectionCard title={`Satıcı Bazlı Stopaj${period ? ` — ${period}` : ""}`}>
      <ResourceList.Table<WithholdingRow>
        columns={withholdingColumns}
        emptyText="Bu dönemde stopaj kesilen ödeme yok."
      />
    </SectionCard>
  );
}

export function WithholdingTab() {
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
    successMessage: "Stopaj oranı güncellendi",
    fallback: "1",
  });

  return (
    <div className="space-y-6">
      <SectionCard
        title="E-Ticaret Stopajı (Tevkifat)"
        bodyClassName="space-y-4"
      >
        <p className="text-sm text-muted">
          GVK 94/19 kapsamında, vergi mükellefi (kurumsal onaylı) satıcılara
          yapılan ödemelerden KDV hariç ürün bedeli üzerinden kesilir ve
          muhtasar beyanname ile ödenir. Bireysel satıcılar kapsam dışıdır.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <Input
            type="number"
            min={0}
            max={100}
            step={0.01}
            label="Stopaj Oranı (%)"
            value={whRate}
            onChange={(event) => setWhRate(event.target.value)}
            className="w-32"
          />
          <Button onClick={onSaveRate} isLoading={savingRate}>
            Kaydet
          </Button>
        </div>
      </SectionCard>

      <ResourceList<WithholdingRow>
        resource="withholding-report"
        fetcher={withholdingFetcher}
        getRowId={(row) => row.sellerId}
        limit={1000}
        syncUrl
        initialFilters={INITIAL_FILTERS}
      >
        <WithholdingControls />
        <WithholdingSummary />
        <WithholdingTable />
      </ResourceList>
    </div>
  );
}

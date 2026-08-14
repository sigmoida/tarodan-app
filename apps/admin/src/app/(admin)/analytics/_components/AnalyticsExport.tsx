"use client";

import { Button } from "@tarodan/ui";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { downloadBlob } from "@/lib/download";
import { type DateRange, getDateRangeParams } from "../_lib/types";

/** CSV / JSON report export for the active tab + date range (header actions). */
export function AnalyticsExport({
  dateRange,
  activeTab,
}: {
  dateRange: DateRange;
  activeTab: string;
}) {
  const t = useTranslations();
  const range = getDateRangeParams(dateRange);
  const base = `rapor-${activeTab}-${range.startDate}-${range.endDate}`;

  const onCsv = async () => {
    const res = await adminApi.exportReport(activeTab, "csv", range);
    const content = (res.data as { content?: string })?.content ?? "";
    downloadBlob(`${base}.csv`, "﻿" + content);
  };

  const onJson = async () => {
    const res = await adminApi.exportReport(activeTab, "pdf", range);
    downloadBlob(
      `${base}.json`,
      JSON.stringify(res.data, null, 2),
      "application/json",
    );
  };

  return (
    <>
      <Button
        variant="outline"
        leftIcon={<ArrowDownTrayIcon className="h-5 w-5" />}
        onClick={onCsv}
        aria-label={t("admin.analytics.export.csv")}
      >
        <span className="hidden sm:inline">
          {t("admin.analytics.export.csv")}
        </span>
      </Button>
      <Button
        variant="primary"
        leftIcon={<ArrowDownTrayIcon className="h-5 w-5" />}
        onClick={onJson}
        aria-label={t("admin.analytics.export.json")}
      >
        <span className="hidden sm:inline">
          {t("admin.analytics.export.json")}
        </span>
      </Button>
    </>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@tarodan/ui";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import type { AnalyticsExportFormat, AnalyticsTab } from "@tarodan/types";
import { adminApi } from "@/lib/api";
import { downloadBlob } from "@/lib/download";
import { toRangeQuery, type AnalyticsRangeSelection } from "../_lib/rangeParams";

/**
 * Downloads the ACTIVE tab over the ACTIVE range, as the server rendered it.
 *
 * The old pair of buttons lied twice: the "JSON" one called `format=pdf` and
 * saved the placeholder response ("PDF generation requires frontend
 * implementation"), and the CSV one re-assembled a body the server had already
 * built, unquoted. Both are now one download of one file the API produced from
 * the same numbers the screen is showing.
 */
export function AnalyticsExport({
  tab,
  selection,
}: {
  tab: AnalyticsTab;
  selection: AnalyticsRangeSelection;
}) {
  const t = useTranslations();
  const [busy, setBusy] = useState<AnalyticsExportFormat | null>(null);

  const download = async (format: AnalyticsExportFormat) => {
    setBusy(format);
    try {
      const response = await adminApi.exportAnalyticsTab(tab, format, {
        ...toRangeQuery(selection),
      });
      const disposition = String(
        response.headers?.["content-disposition"] ?? "",
      );
      const name =
        /filename="([^"]+)"/.exec(disposition)?.[1] ??
        `analitik-${tab}-${selection.from}-${selection.to}.${format}`;

      downloadBlob(
        name,
        response.data as BlobPart,
        String(response.headers?.["content-type"] ?? "text/csv;charset=utf-8;"),
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        leftIcon={<ArrowDownTrayIcon className="h-5 w-5" />}
        onClick={() => void download("csv")}
        loading={busy === "csv"}
        aria-label={t("admin.analytics.export.csv")}
      >
        <span className="hidden sm:inline">
          {t("admin.analytics.export.csv")}
        </span>
      </Button>
      <Button
        variant="primary"
        leftIcon={<ArrowDownTrayIcon className="h-5 w-5" />}
        onClick={() => void download("xlsx")}
        loading={busy === "xlsx"}
        aria-label={t("admin.analytics.export.xlsx")}
      >
        <span className="hidden sm:inline">
          {t("admin.analytics.export.xlsx")}
        </span>
      </Button>
    </>
  );
}

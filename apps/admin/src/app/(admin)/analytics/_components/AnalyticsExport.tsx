"use client";

import type { AnalyticsTab } from "@tarodan/types";
import { adminApi } from "@/lib/api";
import { ExportButton } from "@/components/list/ExportButton";
import {
  toRangeQuery,
  type AnalyticsRangeSelection,
} from "../_lib/rangeParams";

/**
 * Etkin sekmeyi etkin aralıkta, API'nin ekrandaki sayılardan ürettiği Excel
 * dosyası olarak indirir. Liste bağlamı yoktur; aralık kendi parametresidir.
 */
export function AnalyticsExport({
  tab,
  selection,
}: {
  tab: AnalyticsTab;
  selection: AnalyticsRangeSelection;
}) {
  return (
    <ExportButton
      listState={false}
      fetcher={() => adminApi.exportAnalyticsTab(tab, toRangeQuery(selection))}
      fallbackFilename={`analitik-${tab}-${selection.from}-${selection.to}.xlsx`}
    />
  );
}

"use client";

import { useTranslations } from "next-intl";
import type { AdminRefundRow } from "@tarodan/types";
import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { refundFilterFields } from "../_lib/filters";
import { REFUND_REQUESTS_RESOURCE } from "../_lib/resource";
import { useRefundTabs } from "../_hooks/useRefundTabs";
import { RefundsTabBar } from "./RefundsTabBar";
import { RefundsTable } from "./RefundsTable";
import { RefundsExportButton } from "./RefundsExportButton";

/**
 * İadeler: üst sekme (Tümü / Direk Satış / Teklif / Takas) × durum alt sekmesi.
 * Sekme ve alt sekme URL'de yaşar ve her isteğe eklenir; filtre değil, liste
 * kapsamıdır. Liste kapsam değişince yeniden kurulur, filtreler URL'den geri
 * okunur.
 */
export function RefundsView() {
  const t = useTranslations();
  const { tab, bucket } = useRefundTabs();

  return (
    <ResourceList<AdminRefundRow>
      key={`${tab}:${bucket}`}
      resource={REFUND_REQUESTS_RESOURCE}
      fetcher={(params) =>
        adminApi.getRefundRequests({ ...params, tab, bucket })
      }
      scope={{ tab, bucket }}
      getRowId={(row) => row.id}
      syncUrl
      filters={refundFilterFields(t)}
    >
      <RefundsTabBar />
      <ResourceList.Toolbar
        searchPlaceholder={t("admin.operations.refunds.searchPlaceholder")}
      >
        <RefundsExportButton />
      </ResourceList.Toolbar>
      <RefundsTable tab={tab} />
      <ResourceList.Pagination />
    </ResourceList>
  );
}

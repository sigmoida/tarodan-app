"use client";

import { useTranslations } from "next-intl";
import type { AdminCancellationRow } from "@tarodan/types";
import { adminApi } from "@/lib/api";
import { ResourceList } from "@/components/list";
import { cancellationFilterFields } from "../_lib/filters";
import { CANCELLATIONS_RESOURCE } from "../_lib/resource";
import { useCancellationTabs } from "../_hooks/useCancellationTabs";
import { CancellationTabBar } from "./CancellationTabBar";
import {
  CancellationResultCount,
  CancellationsTable,
} from "./CancellationsTable";
import { CancellationExportButton } from "./CancellationExportButton";

/**
 * İptaller sekmesi: sekme (Tüm / Direkt Satış / Teklifler / Takaslar) × alt
 * sekme (Tümü / Yeni / Alıcı / Satıcı / Tarodan). Sekme ve alt sekme URL'de
 * yaşar ve her isteğe eklenir; filtre değil, liste kapsamıdır. Liste kapsam
 * değişince yeniden kurulur, filtreler URL'den geri okunur.
 */
export function CancellationsView() {
  const t = useTranslations();
  const { tab, bucket } = useCancellationTabs();

  return (
    <ResourceList<AdminCancellationRow>
      key={`${tab}:${bucket}`}
      resource={CANCELLATIONS_RESOURCE}
      fetcher={(params) =>
        adminApi.getCancellations({ ...params, tab, bucket })
      }
      scope={{ tab, bucket }}
      getRowId={(row) => `${row.kind}:${row.id}`}
      syncUrl
      filters={cancellationFilterFields(t)}
    >
      <CancellationTabBar />
      <ResourceList.Toolbar>
        <CancellationExportButton />
      </ResourceList.Toolbar>
      <CancellationResultCount />
      <CancellationsTable />
      <ResourceList.Pagination />
    </ResourceList>
  );
}

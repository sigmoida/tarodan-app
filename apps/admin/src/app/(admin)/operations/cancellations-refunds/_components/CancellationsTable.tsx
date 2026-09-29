"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { AdminCancellationRow } from "@tarodan/types";
import { DataTable } from "@/components/DataTable";
import { useResourceList } from "@/components/list";
import { cancellationColumns } from "../_lib/columns";

/**
 * İptal tablosu: satır = sepet / sipariş / takas (API satırı hazır döner,
 * sayfada eşleme yok). Sıralama yalnız iptal tarihi kolonundan.
 */
export function CancellationsTable() {
  const t = useTranslations();
  const { rows, isLoading, search, filters, sort, setSort } =
    useResourceList<AdminCancellationRow>();
  const columns = useMemo(() => cancellationColumns(t), [t]);

  const filtered =
    !!search ||
    Object.values(filters).some((value) => value && value !== "all");

  return (
    <DataTable
      columns={columns}
      data={rows}
      loading={isLoading}
      emptyText={
        filtered
          ? t("admin.operations.cancellations.emptyFiltered")
          : t("admin.operations.cancellations.empty")
      }
      getRowId={(row) => `${row.kind}:${row.id}`}
      sort={sort}
      onSort={setSort}
    />
  );
}

/** "Filtreleme sonuçları: toplam N iptal" — listenin sunucu toplamı. */
export function CancellationResultCount() {
  const t = useTranslations();
  const { total } = useResourceList();
  return (
    <p className="text-sm text-muted">
      {t("admin.operations.cancellations.resultCount", { count: total })}
    </p>
  );
}

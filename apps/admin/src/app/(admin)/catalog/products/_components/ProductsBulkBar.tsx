"use client";

import { useTranslations } from "next-intl";
import { Button } from "@tarodan/ui";
import { ResourceList, useResourceList } from "@/components/list";
import { useBulkRenew } from "../_lib/useBulkRenew";
import {
  canBulkRenew,
  renewableRows,
  type RenewTarget,
} from "../_lib/bulkRenew";
import { BulkRenewResultModal } from "./BulkRenewResultModal";

/**
 * Seçim barı (Pasif sekmesi): "Toplu yenile" yalnız seçimdeki süresi dolmuş
 * ilanlara uygulanır (tablo yalnız onların seçilmesine izin verir); sayısı
 * butonda yazar. Seçim, onaylanıp gönderilince temizlenir.
 */
export function ProductsBulkBar() {
  const t = useTranslations();
  const { rows, selection } = useResourceList<RenewTarget>();
  const { run, isPending, report, closeReport } = useBulkRenew();

  const selected = new Set(selection.selectedIds);
  const selectedRows = rows.filter((row) => selected.has(row.id));

  return (
    <>
      <ResourceList.BulkBar>
        <Button
          size="sm"
          variant="outline"
          disabled={!canBulkRenew(selectedRows, isPending)}
          isLoading={isPending}
          onClick={async () => {
            if (await run(selectedRows)) selection.clear();
          }}
        >
          {t("admin.catalog.products.bulkRenew")} (
          {renewableRows(selectedRows).length})
        </Button>
      </ResourceList.BulkBar>
      <BulkRenewResultModal report={report} onClose={closeReport} />
    </>
  );
}

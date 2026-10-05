"use client";

import { useTranslations } from "next-intl";
import { TableCellsIcon } from "@heroicons/react/24/outline";
import { ToolbarActionButton } from "@/components/list/ToolbarActionButton";
import { useResourceList } from "@/components/list";
import { useConsentExport } from "../_hooks/useConsentExport";

/**
 * Filtrenin tamamını Excel olarak indirir (toolbar'ın CSV düğmesi yalnız
 * yüklü sayfayı aktarır). Sunucu her indirmeyi denetim kaydına yazar.
 */
export function ConsentsExportButton() {
  const t = useTranslations();
  const { total } = useResourceList();
  const { download, isExporting } = useConsentExport();
  return (
    <ToolbarActionButton
      label={t("admin.consents.exportButton")}
      icon={<TableCellsIcon className="h-4 w-4" />}
      onClick={() => void download()}
      isLoading={isExporting}
      disabled={total === 0}
    />
  );
}

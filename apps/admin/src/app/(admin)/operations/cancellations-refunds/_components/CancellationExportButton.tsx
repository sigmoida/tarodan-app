"use client";

import { useTranslations } from "next-intl";
import { TableCellsIcon } from "@heroicons/react/24/outline";
import { ToolbarActionButton } from "@/components/list/ToolbarActionButton";
import { useResourceList } from "@/components/list";
import { useCancellationExport } from "../_hooks/useCancellationExport";

/**
 * Geçerli filtrenin tamamını (yalnız ekrandaki sayfayı değil) Excel olarak
 * indirir. Toolbar'ın kendi CSV düğmesi yüklü satırları aktarır; bu düğme
 * sunucunun ürettiği dosyadır.
 */
export function CancellationExportButton() {
  const t = useTranslations();
  const { total } = useResourceList();
  const { download, isExporting } = useCancellationExport();
  return (
    <ToolbarActionButton
      label={t("admin.operations.cancellations.export.button")}
      icon={<TableCellsIcon className="h-4 w-4" />}
      onClick={() => void download()}
      isLoading={isExporting}
      disabled={total === 0}
    />
  );
}

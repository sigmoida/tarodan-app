"use client";

import { useTranslations } from "next-intl";
import { TableCellsIcon } from "@heroicons/react/24/outline";
import { ToolbarActionButton } from "@/components/list/ToolbarActionButton";
import { useResourceList } from "@/components/list";
import { useGibReportExport } from "../_hooks/useGibReportExport";

/**
 * Filtrenin tamamını Excel olarak indirir. Dosya TAM kimlik numaralarını
 * taşır; sunucu her indirmeyi denetim kaydına yazar.
 */
export function GibReportExportButton() {
  const t = useTranslations();
  const { total } = useResourceList();
  const { download, isExporting } = useGibReportExport();
  return (
    <ToolbarActionButton
      label={t("admin.gibReport.exportButton")}
      icon={<TableCellsIcon className="h-4 w-4" />}
      onClick={() => void download()}
      isLoading={isExporting}
      disabled={total === 0}
    />
  );
}

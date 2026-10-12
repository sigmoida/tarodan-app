"use client";

import { useContext } from "react";
import { Button, type ButtonProps } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { ResourceListContext } from "@/context/ResourceListContext";
import { useListExport, type ListExportOptions } from "@/hooks/useListExport";

type ExportButtonProps = ListExportOptions & Pick<ButtonProps, "className">;

/**
 * "Excel'e aktar": ekrandaki listenin sunucu tarafı Excel dökümü. Simge
 * taşımaz (UI sözleşmesi). `ResourceList.Header actions` / `Toolbar` içinde ya
 * da tek başına kullanılır; sayfa yalnız `{ fetcher, params }` verir. Liste
 * boşken (bağlam varsa) devre dışıdır.
 */
export function ExportButton({ className, ...options }: ExportButtonProps) {
  const t = useTranslations();
  const list = useContext(ResourceListContext);
  const { download, isExporting } = useListExport(options);
  return (
    <Button
      variant="outline"
      className={className}
      isLoading={isExporting}
      disabled={options.listState !== false && list?.total === 0}
      onClick={() => void download()}
    >
      {t("admin.shared.export.button")}
    </Button>
  );
}

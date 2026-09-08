"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@tarodan/ui";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { adminApi } from "@/lib/api";
import { downloadBlob } from "@/lib/download";
import { useTranslations } from "next-intl";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Ekrandaki filtrelerle 21 kolonluk Excel dökümü — müşavire giden dosya. */
export function SettlementExport() {
  const t = useTranslations();
  const sp = useSearchParams();
  const [busy, setBusy] = useState(false);

  const onExport = async () => {
    setBusy(true);
    try {
      const startDate = sp.get("startDate") || undefined;
      const endDate = sp.get("endDate") || undefined;
      const res = await adminApi.exportSettlementReport({
        startDate,
        endDate,
        sellerId: sp.get("sellerId") || undefined,
      });
      const period = [startDate, endDate].filter(Boolean).join("_");
      downloadBlob(
        period
          ? `tarodan-hakedis-dokumu-${period}.xlsx`
          : "tarodan-hakedis-dokumu.xlsx",
        res.data as Blob,
        XLSX_MIME,
      );
      toast.success(t("admin.finance.settlement.exported"));
    } catch {
      toast.error(t("admin.finance.settlement.exportFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="outline"
      leftIcon={<ArrowDownTrayIcon className="h-5 w-5" />}
      isLoading={busy}
      onClick={onExport}
    >
      {t("admin.finance.settlement.exportExcel")}
    </Button>
  );
}

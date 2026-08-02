"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@tarodan/ui";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { adminApi } from "@/lib/api";
import { downloadBlob } from "@/lib/download";
import { useTranslations } from "next-intl";

/** CSV export of the current transaction filters (read from the URL). */
export function PayoutsExport() {
  const t = useTranslations();
  const sp = useSearchParams();
  const [busy, setBusy] = useState(false);

  const onExport = async () => {
    setBusy(true);
    try {
      const res = await adminApi.getPayoutsExport({
        status: sp.get("status") || undefined,
        dateFrom: sp.get("dateFrom") || undefined,
        dateTo: sp.get("dateTo") || undefined,
      });
      const { csv, filename } = res.data;
      downloadBlob(filename, csv);
      toast.success(t("admin.finance.payouts.exported"));
    } catch {
      toast.error(t("admin.finance.payouts.exportFailed"));
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
      {t("admin.finance.payouts.exportCsv")}
    </Button>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@tarodan/ui";
import { TableCellsIcon } from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { adminApi } from "@/lib/api";
import { downloadBlob } from "@/lib/download";
import { extractErrorMessage } from "@/lib/error";
import { useTranslations } from "next-intl";

/**
 * Tek faturanın detay dökümü (Excel): belgenin kalem kırılımı + dayandığı işlem.
 *
 * Hizmet faturaları tek kalemlidir; o belgelerde asıl bilgi ikinci sayfadaki
 * kaynak işlemdir (hangi koli, hangi ürünler, hangi takas). Dosya sunucuda
 * üretilir — kalemleri ekranda yeniden hesaplamak, faturada yazanla dökümde
 * yazanın ayrışması demek olurdu.
 */
export function InvoiceDetailButton({ id }: { id: string }) {
  const t = useTranslations();
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    setBusy(true);
    try {
      const res = await adminApi.getInvoiceDetailExport(id);
      const disposition = String(res.headers?.["content-disposition"] ?? "");
      const named = /filename="?([^";]+)"?/.exec(disposition)?.[1];
      downloadBlob(named || `fatura-detay-${id}.xlsx`, res.data as Blob);
      toast.success(t("admin.finance.invoices.detailExported"));
    } catch (error) {
      toast.error(
        extractErrorMessage(
          error,
          t("admin.finance.invoices.detailExportFailed"),
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      leftIcon={<TableCellsIcon className="h-4 w-4" />}
      isLoading={busy}
      onClick={onClick}
      className="text-primary-600"
    >
      {t("admin.finance.invoices.detailExport")}
    </Button>
  );
}

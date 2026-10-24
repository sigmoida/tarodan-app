/** @format */

"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/hooks/useWebMutation";

/**
 * What one "Fatura" button does when the order has several documents:
 * - `orderDetail`: go to the order detail, which lists them side by side
 *   (a marketplace order: each service line gets its own document, and
 *   opening one at random would read as "this is my invoice");
 * - `primary`: open the first one, the sale invoice (the API ranks it first).
 *   For a boost, whose order has no order detail page; a later return or
 *   cancellation document does not replace the sale invoice.
 */
export type InvoiceManyMode = "orderDetail" | "primary";

/**
 * Opens an order's e-Arşiv PDF, with a per-order loading state. One document
 * opens directly; several follow `many`.
 */
export function useInvoiceDownload({
  many = "orderDetail",
}: { many?: InvoiceManyMode } = {}) {
  const t = useTranslations();
  const router = useRouter();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const download = async (orderId: string) => {
    setDownloadingId(orderId);
    try {
      const invoiceRes = await api.get(
        `/elogo/invoices/by-order/${orderId}/all`,
      );
      const invoices = Array.isArray(invoiceRes.data) ? invoiceRes.data : [];
      if (invoices.length === 0) {
        toast.error(t("order.invoiceNotReady"));
        return;
      }
      if (invoices.length > 1 && many === "orderDetail") {
        router.push(`/profile/orders/${orderId}`);
        return;
      }
      const res = await api.get(`/elogo/invoices/${invoices[0].id}/pdf`);
      const url = res.data?.url;
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
        toast.success(t("order.invoiceOpened"));
      } else {
        toast.error(t("order.invoiceNotReady"));
      }
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      toast.error(
        status === 404
          ? t("order.invoiceNotReady")
          : (apiErrorMessage(err) ?? t("common.downloadFailed")),
      );
    } finally {
      setDownloadingId(null);
    }
  };

  return { downloadingId, download };
}

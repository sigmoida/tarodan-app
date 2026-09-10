"use client";

import { useState } from "react";
import { Button } from "@tarodan/ui";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { adminApi } from "@/lib/api";
import { downloadBlob } from "@/lib/download";
import { extractErrorMessage } from "@/lib/error";
import { useTranslations } from "next-intl";

/** İçerik tipi ne olursa olsun hata gövdesinden okunabilir bir mesaj çıkarır. */
async function messageFromBlobError(error: unknown): Promise<string | null> {
  const body = (error as { response?: { data?: unknown } })?.response?.data;
  if (!(body instanceof Blob)) return null;
  try {
    const parsed = JSON.parse(await body.text()) as { message?: string };
    return parsed.message ?? null;
  } catch {
    return null;
  }
}

/**
 * eLogo ve satıcı faturaları için ortak PDF indirme butonu.
 *
 * eLogo ucu İKİ biçim döndürür: S3'te kopya varsa `{url}` JSON'u (yeni sekmede
 * açılır), yoksa belgeyi e-Logo'dan canlı çekip ham PDF olarak akıtır (dosya
 * olarak indirilir). Buton eskiden yalnız `data.url` okuduğu için ikinci
 * durumda hiçbir şey yapmıyor, hata da vermiyordu.
 */
export function InvoicePdfButton({
  id,
  seller,
}: {
  id: string;
  seller: boolean;
}) {
  const t = useTranslations();
  const [busy, setBusy] = useState(false);

  const openUrl = (url: string) =>
    window.open(url, "_blank", "noopener,noreferrer");

  const onClick = async () => {
    setBusy(true);
    try {
      if (seller) {
        const res = await adminApi.getSellerInvoicePdf(id);
        const url = (res.data as { url?: string })?.url;
        if (!url) throw new Error(t("common.downloadFailed"));
        openUrl(url);
        return;
      }

      const res = await adminApi.getInvoicePdf(id);
      const blob = res.data as Blob;
      if (blob.type.includes("application/pdf")) {
        const disposition = String(res.headers?.["content-disposition"] ?? "");
        const named = /filename="?([^";]+)"?/.exec(disposition)?.[1];
        downloadBlob(named || `fatura-${id}.pdf`, blob, "application/pdf");
        return;
      }
      // JSON gövdesi de blob olarak gelir; presigned URL'i oradan çıkar.
      const { url } = JSON.parse(await blob.text()) as { url?: string };
      if (!url) throw new Error(t("common.downloadFailed"));
      openUrl(url);
    } catch (error) {
      const fromBody = await messageFromBlobError(error);
      toast.error(
        fromBody ?? extractErrorMessage(error, t("common.downloadFailed")),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      leftIcon={<ArrowDownTrayIcon className="h-4 w-4" />}
      isLoading={busy}
      onClick={onClick}
      className="text-primary-600"
    >
      {t("admin.finance.common.download")}
    </Button>
  );
}

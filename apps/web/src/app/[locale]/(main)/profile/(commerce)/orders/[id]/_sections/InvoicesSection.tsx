/** @format */

"use client";

import { useRef } from "react";
import toast from "react-hot-toast";
import { Button } from "@tarodan/ui";
import { SectionCard } from "@/components/ui";
import { useTranslations } from "next-intl";
import {
  useDownloadElogoInvoice,
  useDownloadSellerInvoice,
  useElogoInvoices,
  useSellerInvoice,
  useUploadSellerInvoice,
} from "../_hooks/useOrderDetail";
import type { OrderDetail } from "../_lib/types";

export default function InvoicesSection({ order }: { order: OrderDetail }) {
  const t = useTranslations();
  const orderId = order.id;

  const elogoQuery = useElogoInvoices(orderId, order);
  const sellerInvoiceQuery = useSellerInvoice(orderId, order);
  const downloadElogo = useDownloadElogoInvoice();
  const uploadSeller = useUploadSellerInvoice(orderId);
  const downloadSeller = useDownloadSellerInvoice(orderId);
  const sellerInvoiceInputRef = useRef<HTMLInputElement>(null);

  // Ödeme öncesi / iptal edilmiş siparişte fatura kartları gösterilmez.
  const invoiceVisible =
    order.status !== "pending_payment" && order.status !== "cancelled";
  const elogoInvoices = invoiceVisible ? (elogoQuery.data ?? []) : [];
  const sellerInvoice = invoiceVisible
    ? (sellerInvoiceQuery.data ?? null)
    : null;

  // Kurumsal satıcı: siparişe fatura PDF yükle/değiştir (yükleme öncesi doğrulama).
  const handleSellerInvoiceFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error(t("order.pdfOnly"));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error(t("order.maxPdfSize"));
      return;
    }
    uploadSeller.mutate(file);
  };

  return (
    <>
      {/* e-Arşiv belgeleri — HER HİZMET İÇİN AYRI belge kesilir (komisyon,
          hizmet bedeli, kargo payı), bu yüzden kart tek değil listedir. */}
      {elogoInvoices.length > 0 && (
        <SectionCard title={t("order.invoice")}>
          <p className="text-sm text-body mb-3">
            {t("order.invoiceSentToEmail")}
          </p>
          <ul className="space-y-2">
            {elogoInvoices.map((invoice) => (
              <li
                key={invoice.id}
                className="flex flex-wrap items-center gap-3 p-3 bg-surface-alt rounded-lg border border-border-subtle"
              >
                <svg
                  className="w-5 h-5 text-success-600 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-body truncate">{invoice.label}</p>
                  {invoice.invoiceNumber && (
                    <p className="text-xs text-muted">
                      {t("order.invoiceNo") + invoice.invoiceNumber}
                    </p>
                  )}
                </div>
                {/* Yükleniyor durumu SATIR bazlıdır: tek `isPending` bayrağı
                    tıklanmayan belgelerin düğmesini de kilitliyordu. */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadElogo.mutate(invoice.id)}
                  disabled={
                    downloadElogo.isPending &&
                    downloadElogo.variables === invoice.id
                  }
                >
                  {downloadElogo.isPending &&
                  downloadElogo.variables === invoice.id
                    ? t("common.opening")
                    : t("order.viewDownloadInvoice")}
                </Button>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {/* Ürün faturası beklentisi: alıcı ne bekleyeceğini bilmeli. Bireysel
          satıcıda ürün faturası HİÇ gelmez; kurumsalda gelir ama gecikebilir. */}
      {sellerInvoice?.isBuyer && !sellerInvoice.invoice && (
        <SectionCard title={t("order.sellerInvoice")}>
          <p className="text-sm text-muted">
            {sellerInvoice.sellerIssuesInvoice
              ? t("payment.sellerInvoicePending")
              : t("payment.individualSellerNoInvoice")}
          </p>
        </SectionCard>
      )}

      {/* Kurumsal satıcı faturası (elle yüklenen PDF) */}
      {sellerInvoice &&
        (sellerInvoice.canUpload ||
          (sellerInvoice.invoice &&
            (sellerInvoice.isBuyer || sellerInvoice.isSeller))) && (
          <SectionCard title={t("order.sellerInvoice")}>
            {sellerInvoice.invoice ? (
              <div className="flex items-start gap-3 p-3 bg-surface rounded-lg border border-default">
                <svg
                  className="w-5 h-5 text-brand-600 mt-0.5 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                  />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-body truncate">
                    {sellerInvoice.invoice.fileName}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => downloadSeller.mutate()}
                      disabled={downloadSeller.isPending}
                    >
                      {downloadSeller.isPending
                        ? t("common.opening")
                        : t("order.viewDownload")}
                    </Button>
                    {sellerInvoice.canUpload && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => sellerInvoiceInputRef.current?.click()}
                        disabled={uploadSeller.isPending}
                      >
                        {uploadSeller.isPending
                          ? t("common.uploading")
                          : t("common.replace")}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-surface rounded-lg border border-dashed border-default">
                <p className="text-sm text-muted mb-3">
                  {t("order.uploadInvoiceNotice")}
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => sellerInvoiceInputRef.current?.click()}
                  disabled={uploadSeller.isPending}
                >
                  {uploadSeller.isPending
                    ? t("common.uploading")
                    : t("order.uploadInvoicePdf")}
                </Button>
              </div>
            )}

            <input
              ref={sellerInvoiceInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleSellerInvoiceFile}
            />
          </SectionCard>
        )}
    </>
  );
}

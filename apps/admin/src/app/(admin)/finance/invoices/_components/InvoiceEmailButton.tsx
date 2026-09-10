"use client";

import { Button } from "@tarodan/ui";
import { EnvelopeIcon } from "@heroicons/react/24/outline";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { useConfirm } from "@/provider/ConfirmProvider";
import { fmtDate } from "@/lib/format";
import { ELOGO_INVOICE_LIST_RESOURCES, type Invoice } from "../_lib/types";
import { useTranslations } from "next-intl";

/**
 * Faturayı alıcısına yeniden e-postalar.
 *
 * Kesim yolunda "bir kez mail" güvencesi vardır ve otomatik tetikleyicilerin
 * aynı belgeyi defalarca yollamasını engeller; bu düğme onu BİLEREK aşar. Bir
 * kez gönderilmiş belgeyi tekrar yollamak müşteriye ikinci bir e-posta demek
 * olduğu için önce onay sorulur ve son gönderim tarihi düğmenin altında yazar.
 */
export function InvoiceEmailButton({ invoice }: { invoice: Invoice }) {
  const t = useTranslations();
  const confirm = useConfirm();
  const send = useAdminMutation((id: string) => adminApi.emailInvoice(id), {
    // Gönderim tarihi satırda yazıyor; her sekmenin listesi tazelenmeli.
    invalidates: ELOGO_INVOICE_LIST_RESOURCES,
    successMessage: t("admin.finance.invoices.emailSent", {
      email: invoice.recipientEmail ?? invoice.recipientName ?? "",
    }),
  });

  // Kesilmemiş belgenin PDF'i yoktur; API de reddeder.
  const issued = invoice.status === "sent" || invoice.status === "signed";
  if (!issued) return <span className="text-xs text-muted">—</span>;

  return (
    <div className="text-right">
      <Button
        variant="ghost"
        size="sm"
        leftIcon={<EnvelopeIcon className="h-4 w-4" />}
        isLoading={send.isPending}
        className="text-primary-600"
        onClick={() =>
          confirm({
            title: t("admin.finance.invoices.sendEmail"),
            description: t("admin.finance.invoices.emailResendConfirm", {
              invoiceNumber: invoice.invoiceNumber ?? "",
            }),
            onConfirm: () => send.mutateAsync(invoice.id),
          })
        }
      >
        {t("admin.finance.invoices.sendEmail")}
      </Button>
      {invoice.emailSentAt && (
        <p className="mt-1 text-xs text-muted">
          {t("admin.finance.invoices.emailSentAt", {
            date: fmtDate(invoice.emailSentAt),
          })}
        </p>
      )}
    </div>
  );
}

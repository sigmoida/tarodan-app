/** @format */

"use client";

import { DocumentArrowDownIcon } from "@heroicons/react/24/outline";
import { Badge, Button, Spinner } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { SectionCard } from "@/components/ui";

interface PaymentDetailsCardProps {
  payment: any;
  isCompleted: boolean;
  invoice: { id: string } | null;
  invoiceError: boolean;
  downloading: boolean;
  onDownload: () => void;
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span className="font-semibold">{children}</span>
    </div>
  );
}

export default function PaymentDetailsCard({
  payment,
  isCompleted,
  invoice,
  invoiceError,
  downloading,
  onDownload,
}: PaymentDetailsCardProps) {
  const t = useTranslations();
  return (
    <SectionCard title={t("payment.detailsTitle")} className="text-left">
      <div className="space-y-2 text-sm">
        <Row label={`${t("payment.amountLabel")}:`}>
          {payment.amount?.toLocaleString("tr-TR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}{" "}
          TL
        </Row>
        <Row label={`${t("checkout.paymentMethod")}:`}>PayTR</Row>
        {payment.providerTransactionId && (
          <Row label={`${t("payment.transactionIdLabel")}:`}>
            <span className="font-mono text-xs">
              {payment.providerTransactionId}
            </span>
          </Row>
        )}
        <div className="flex justify-between">
          <span className="text-muted">{t("common.status")}:</span>
          <Badge variant={isCompleted ? "success" : "warning"}>
            {isCompleted
              ? t("order.statusCompleted")
              : t("payment.statusAwaitingConfirmation")}
          </Badge>
        </div>
      </div>

      {invoice ? (
        <Button
          variant="secondary"
          onClick={onDownload}
          disabled={downloading}
          isLoading={downloading}
          className="mt-4 w-full"
          leftIcon={<DocumentArrowDownIcon className="h-5 w-5" />}
        >
          {downloading
            ? t("payment.downloading")
            : t("payment.downloadInvoice")}
        </Button>
      ) : !invoiceError ? (
        <div className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border-subtle bg-surface px-4 py-3 text-sm font-medium text-subtle">
          <Spinner size="sm" />
          {t("payment.preparingInvoice")}
        </div>
      ) : null}
    </SectionCard>
  );
}

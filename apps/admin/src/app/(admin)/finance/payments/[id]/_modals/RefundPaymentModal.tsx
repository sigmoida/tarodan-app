"use client";

import { useRef } from "react";
import {
  FormModal,
  FormInput,
  FormTextarea,
  useZodForm,
} from "@tarodan/ui/form";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { fmtTry } from "@/lib/format";
import { useTranslations } from "next-intl";
import { refundPaymentSchema, type RefundPaymentValues } from "../_lib/schema";

export function RefundPaymentModal({
  paymentId,
  amount,
  trade,
  onClose,
}: {
  paymentId: string;
  amount: number;
  trade?: { tradeNumber: string; refundableTotal: number };
  onClose: () => void;
}) {
  const t = useTranslations();
  const idempotencyKey = useRef(crypto.randomUUID()).current;
  const form = useZodForm(
    refundPaymentSchema(t, trade?.refundableTotal ?? amount),
    {
      defaultValues: { amount: "", reason: "" },
    },
  );

  const refund = useAdminMutation(
    (v: RefundPaymentValues) =>
      adminApi.manualRefund(paymentId, {
        amount: v.amount ? parseFloat(v.amount) : undefined,
        reason: v.reason || undefined,
        idempotencyKey,
      }),
    {
      invalidates: ["payments"],
      successMessage: t("admin.finance.payments.refundStarted"),
      onSuccess: onClose,
    },
  );

  return (
    <FormModal
      open
      onClose={onClose}
      title={
        trade
          ? t("admin.finance.payments.refundWholeTrade")
          : t("admin.finance.payments.manualRefund")
      }
      size="md"
      form={form}
      onSubmit={(v) => refund.mutate(v)}
      isSubmitting={refund.isPending}
      submitLabel={t("admin.finance.payments.refundConfirm")}
      destructive
    >
      {trade ? (
        <div className="rounded-lg border border-warning-200 bg-warning-50 p-4 text-sm text-warning-900">
          <p className="font-medium">
            {t("admin.finance.payments.tradeRefundTitle", {
              number: trade.tradeNumber,
            })}
          </p>
          <p className="mt-1">
            {t("admin.finance.payments.tradeRefundDescription", {
              amount: fmtTry(trade.refundableTotal),
            })}
          </p>
        </div>
      ) : (
        <>
          <p className="text-muted">
            {t("admin.finance.payments.totalPaymentAmount")}: {fmtTry(amount)}
          </p>
          <FormInput
            name="amount"
            type="number"
            min="0.01"
            max={amount}
            step="0.01"
            label={t("admin.finance.payments.refundAmountLabel")}
            placeholder={t("admin.finance.payments.refundAmountPlaceholder")}
          />
        </>
      )}
      <FormTextarea
        name="reason"
        label={t("admin.finance.payments.refundReasonLabel")}
        rows={3}
        placeholder={t("admin.finance.payments.refundReasonPlaceholder")}
      />
    </FormModal>
  );
}

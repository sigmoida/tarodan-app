"use client";

import { useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Alert } from "@tarodan/ui";
import {
  FormModal,
  FormInput,
  FormTextarea,
  useZodForm,
} from "@tarodan/ui/form";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import {
  BoostRefundRedirectAlert,
  isBoostRefundRedirect,
} from "@/components/finance/BoostRefundRedirectAlert";
import { RefundOutcomeUnknownModal } from "@/components/finance/RefundOutcomeUnknownModal";
import { optionalTlAmountPayload } from "@/lib/amount-input";
import { isRefundOutcomeUnknown } from "@/lib/error";
import { fmtTry } from "@/lib/format";
import { adminKeys } from "@/lib/query/keys";
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

  const queryClient = useQueryClient();
  const refund = useAdminMutation(
    (v: RefundPaymentValues) =>
      adminApi.manualRefund(paymentId, {
        amount: optionalTlAmountPayload(v.amount ?? ""),
        reason: v.reason || undefined,
        idempotencyKey,
      }),
    {
      invalidates: ["payments"],
      successMessage: t("admin.finance.payments.refundStarted"),
      // Shown inline instead of a toast: a boost payment is refused with a
      // pointer to the boost screen, and an unknown outcome replaces the form.
      showErrorToast: (error) =>
        !isBoostRefundRedirect(error) && !isRefundOutcomeUnknown(error),
      onSuccess: onClose,
      mutation: {
        onSettled: (_data, error) => {
          if (error && isRefundOutcomeUnknown(error)) {
            queryClient.invalidateQueries({
              queryKey: adminKeys.all("payments"),
            });
          }
        },
      },
    },
  );
  const title = trade
    ? t("admin.finance.payments.refundWholeTrade")
    : t("admin.finance.payments.manualRefund");

  if (refund.error && isRefundOutcomeUnknown(refund.error)) {
    return <RefundOutcomeUnknownModal title={title} onClose={onClose} />;
  }

  return (
    <FormModal
      open
      onClose={onClose}
      title={title}
      size="md"
      form={form}
      onSubmit={(v) => refund.mutate(v)}
      isSubmitting={refund.isPending}
      submitLabel={t("admin.finance.payments.refundConfirm")}
      destructive
    >
      {isBoostRefundRedirect(refund.error) && <BoostRefundRedirectAlert />}
      {trade ? (
        <Alert
          variant="warning"
          title={t("admin.finance.payments.tradeRefundTitle", {
            number: trade.tradeNumber,
          })}
        >
          {t("admin.finance.payments.tradeRefundDescription", {
            amount: fmtTry(trade.refundableTotal),
          })}
        </Alert>
      ) : (
        <>
          <p className="text-muted">
            {t("admin.finance.payments.totalPaymentAmount")}: {fmtTry(amount)}
          </p>
          {/* Text, not type="number" (see lib/amount-input). */}
          <FormInput
            name="amount"
            type="text"
            inputMode="decimal"
            autoComplete="off"
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

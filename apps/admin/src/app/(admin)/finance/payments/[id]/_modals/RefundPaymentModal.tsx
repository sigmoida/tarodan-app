"use client";

import { useRef } from "react";
import type { AdminPaymentInstallment } from "@tarodan/types";
import { useQueryClient } from "@tanstack/react-query";
import { Alert } from "@tarodan/ui";
import {
  FormModal,
  FormInput,
  FormTextarea,
  useZodForm,
} from "@tarodan/ui/form";
import { adminApi } from "@/lib/api";
import { DataList, Field } from "@/components/detail/DataList";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import {
  BoostRefundRedirectAlert,
  isBoostRefundRedirect,
} from "@/components/finance/BoostRefundRedirectAlert";
import { RefundOutcomeUnknownModal } from "@/components/finance/RefundOutcomeUnknownModal";
import { optionalTlAmountPayload } from "@tarodan/shared";
import { isRefundOutcomeUnknown } from "@/lib/error";
import { fmtTry } from "@/lib/format";
import { adminKeys } from "@/lib/query/keys";
import { useTranslations } from "next-intl";
import { refundPaymentSchema, type RefundPaymentValues } from "../_lib/schema";

/**
 * Manual refund of a single-order or trade cash payment.
 *
 * Two scales (ADR 0019): `amount` is the goods amount T, and the admin enters
 * the goods part to refund (the server caps it at T). When the buyer paid an
 * installment fee F, PayTR also gives back its proportional share, priced by
 * the server (`installmentFeeShareOf`), so the modal shows C and F, says
 * that the fee follows, and the success toast names the cash actually
 * refunded from the response.
 */
export function RefundPaymentModal({
  paymentId,
  amount,
  installment,
  trade,
  onClose,
}: {
  paymentId: string;
  /** T: the goods-scale amount (`Payment.amount`), the refund cap. */
  amount: number;
  /** The payment's installment block; F > 0 switches to the two-scale copy. */
  installment?: Pick<
    AdminPaymentInstallment,
    "installmentFeeAmount" | "chargedAmount"
  >;
  trade?: { tradeNumber: string; refundableTotal: number };
  onClose: () => void;
}) {
  const t = useTranslations();
  const fee =
    !trade && installment && installment.installmentFeeAmount > 0
      ? installment
      : null;
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
      successMessage: ({ data }) =>
        fee && data.cashRefunded != null && data.installmentFeeRefunded != null
          ? t("admin.finance.payments.refundInstallment.started", {
              cash: fmtTry(data.cashRefunded) ?? "",
              fee: fmtTry(data.installmentFeeRefunded) ?? "",
            })
          : t("admin.finance.payments.refundStarted"),
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
          {fee ? (
            <>
              <DataList columns={1}>
                <Field
                  label={t("admin.finance.payments.installment.goodsAmount")}
                >
                  {fmtTry(amount)}
                </Field>
                <Field
                  label={t("admin.finance.installments.preview.columns.fee")}
                >
                  {fmtTry(fee.installmentFeeAmount)}
                </Field>
                <Field
                  label={t("admin.finance.payments.installment.chargedAmount")}
                >
                  {fmtTry(fee.chargedAmount)}
                </Field>
              </DataList>
              <Alert
                variant="info"
                title={t(
                  "admin.finance.payments.refundInstallment.noticeTitle",
                )}
              >
                {t("admin.finance.payments.refundInstallment.notice", {
                  fee: fmtTry(fee.installmentFeeAmount) ?? "",
                })}
              </Alert>
            </>
          ) : (
            <p className="text-muted">
              {t("admin.finance.payments.totalPaymentAmount")}: {fmtTry(amount)}
            </p>
          )}
          {/* Text, not type="number" (see `@tarodan/shared` `parseTlAmount`). */}
          <FormInput
            name="amount"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            label={
              fee
                ? t("admin.finance.payments.refundInstallment.amountLabel")
                : t("admin.finance.payments.refundAmountLabel")
            }
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

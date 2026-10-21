"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Alert } from "@tarodan/ui";
import {
  FormInput,
  FormModal,
  FormTextarea,
  useConfirm,
  useZodForm,
} from "@tarodan/ui/form";
import { BOOST_ADMIN_REASON_MAX_LENGTH } from "@tarodan/types";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { isRefundOutcomeUnknown } from "@/lib/error";
import { fmtTry } from "@/lib/format";
import { adminKeys } from "@/lib/query/keys";
import { DataList, Field } from "@/components/detail/DataList";
import { RefundOutcomeUnknownModal } from "@/components/finance/RefundOutcomeUnknownModal";
import {
  isPartialRefund,
  refundBoostPayload,
  refundBoostSchema,
  type RefundBoostValues,
} from "../../_lib/schema";
import type { BoostPurchase } from "../../_lib/types";

/**
 * What a refund and stop changes: the boost, and the payment and order it
 * refunds (their amounts and refund actions).
 */
const REFUND_RESOURCES = ["boost-purchases", "payments", "orders"];

/**
 * Refund a paid boost (all or part of what is left) and stop it at once. The
 * amount defaults to `refundableAmount`; a partial refund stops the boost
 * too and the rest can never be refunded, so the form and the confirm step
 * both say so. The server derives the idempotency key per attempt. When the
 * outcome is unknown (503, a gateway 5xx, no response) the form is replaced
 * by a pointer to the reconciliation, with no way to resubmit, and the
 * screens refetch what the refund may have changed.
 */
export function RefundBoostModal({
  purchase,
  onClose,
}: {
  purchase: Pick<
    BoostPurchase,
    "id" | "price" | "refundedAmount" | "refundableAmount"
  >;
  onClose: () => void;
}) {
  const t = useTranslations();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const max = purchase.refundableAmount;
  const form = useZodForm(refundBoostSchema(t, max), {
    defaultValues: { amount: String(max), reason: "" },
  });

  const refund = useAdminMutation(
    (v: RefundBoostValues) =>
      adminApi
        .refundBoost(purchase.id, refundBoostPayload(v))
        .then((response) => response.data),
    {
      invalidates: REFUND_RESOURCES,
      successMessage: t("admin.marketing.boostPurchases.refund.done"),
      showErrorToast: (error) => !isRefundOutcomeUnknown(error),
      onSuccess: onClose,
      mutation: {
        onSettled: (_data, error) => {
          if (!error || !isRefundOutcomeUnknown(error)) return;
          REFUND_RESOURCES.forEach((resource) =>
            queryClient.invalidateQueries({
              queryKey: adminKeys.all(resource),
            }),
          );
        },
      },
    },
  );

  if (refund.error && isRefundOutcomeUnknown(refund.error)) {
    return (
      <RefundOutcomeUnknownModal
        title={t("admin.marketing.boostPurchases.refund.title")}
        onClose={onClose}
      />
    );
  }

  const submit = async (v: RefundBoostValues) => {
    const confirmed = await confirm({
      title: t("admin.marketing.boostPurchases.refund.title"),
      description: (
        <span className="block space-y-2">
          <span className="block">
            {t("admin.marketing.boostPurchases.refund.confirm")}
          </span>
          {isPartialRefund(v, max) && (
            <span className="block font-medium text-heading">
              {t("admin.marketing.boostPurchases.refund.partialStops")}
            </span>
          )}
        </span>
      ),
      confirmLabel: t("admin.marketing.boostPurchases.refund.action"),
      cancelLabel: t("common.cancel"),
      destructive: true,
    });
    if (confirmed) refund.mutate(v);
  };

  return (
    <FormModal
      open
      onClose={onClose}
      title={t("admin.marketing.boostPurchases.refund.title")}
      size="md"
      form={form}
      onSubmit={submit}
      isSubmitting={refund.isPending}
      submitLabel={t("admin.marketing.boostPurchases.refund.action")}
      cancelLabel={t("common.cancel")}
      closeLabel={t("common.close")}
      destructive
    >
      <DataList columns={1}>
        <Field label={t("admin.marketing.boostPurchases.price")}>
          {fmtTry(purchase.price)}
        </Field>
        {purchase.refundedAmount > 0 && (
          <Field
            label={t("admin.marketing.boostPurchases.detail.refundedAmount")}
          >
            {fmtTry(purchase.refundedAmount)}
          </Field>
        )}
      </DataList>
      <Alert variant="warning">
        {t("admin.marketing.boostPurchases.refund.partialStops")}
      </Alert>
      {/*
        A text field, not type="number": a number input turns "50,25" (a
        Turkish decimal comma) into "", which here would mean "refund all".
      */}
      <FormInput
        name="amount"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        label={t("admin.marketing.boostPurchases.refund.amount")}
        helperText={t("admin.marketing.boostPurchases.refund.amountHelper", {
          max: fmtTry(max),
        })}
      />
      <FormTextarea
        name="reason"
        rows={3}
        maxLength={BOOST_ADMIN_REASON_MAX_LENGTH}
        label={t("admin.marketing.boostPurchases.refund.reason")}
      />
    </FormModal>
  );
}

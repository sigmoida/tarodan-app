"use client";

import { useTranslations } from "next-intl";
import { Alert, Button, Modal } from "@tarodan/ui";
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
import { isRefundPendingReconciliation } from "@/lib/error";
import { fmtTry } from "@/lib/format";
import { DataList, Field } from "@/components/detail/DataList";
import { TextLink } from "@/components/TextLink";
import {
  isPartialRefund,
  refundBoostPayload,
  refundBoostSchema,
  type RefundBoostValues,
} from "../../_lib/schema";
import type { BoostPurchase } from "../../_lib/types";

/** Where staff settle a refund whose PayTR outcome is not known yet. */
const REFUND_RECONCILIATION_HREF = "/finance/payments?tab=reconciliation";

/**
 * Refund a paid boost (all or part of what is left) and stop it at once. The
 * amount defaults to `refundableAmount`; a partial refund stops the boost
 * too and the rest can never be refunded, so the form and the confirm step
 * both say so. The server derives the idempotency key per attempt; a 503
 * (outcome unknown) replaces the form with a pointer to the reconciliation,
 * with no way to resubmit.
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
      invalidates: ["boost-purchases"],
      successMessage: t("admin.marketing.boostPurchases.refund.done"),
      showErrorToast: (error) => !isRefundPendingReconciliation(error),
      onSuccess: onClose,
    },
  );

  if (refund.error && isRefundPendingReconciliation(refund.error)) {
    return <RefundPendingNotice onClose={onClose} />;
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
      <FormInput
        name="amount"
        type="number"
        inputMode="decimal"
        min="0.01"
        max={max}
        step="0.01"
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

/** The refund may have moved money: no resubmit, only the reconciliation. */
function RefundPendingNotice({ onClose }: { onClose: () => void }) {
  const t = useTranslations();
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t("admin.marketing.boostPurchases.refund.title")}
      size="md"
      closeLabel={t("common.close")}
      footer={
        <Button variant="secondary" onClick={onClose}>
          {t("common.close")}
        </Button>
      }
    >
      <Alert
        variant="warning"
        action={
          <TextLink href={REFUND_RECONCILIATION_HREF}>
            {t("admin.finance.payments.refundReconciliation.action")}
          </TextLink>
        }
      >
        {t("admin.marketing.boostPurchases.refund.pendingReconciliation")}
      </Alert>
    </Modal>
  );
}

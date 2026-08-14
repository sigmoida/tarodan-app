"use client";

import { FormModal, FormTextarea, useZodForm } from "@tarodan/ui/form";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { useTranslations } from "next-intl";
import {
  forceCancelPaymentSchema,
  type ForceCancelPaymentValues,
} from "../_lib/schema";

export function ForceCancelPaymentModal({
  paymentId,
  onClose,
}: {
  paymentId: string;
  onClose: () => void;
}) {
  const t = useTranslations();
  const form = useZodForm(forceCancelPaymentSchema(t), {
    defaultValues: { reason: "" },
  });

  const cancel = useAdminMutation(
    (v: ForceCancelPaymentValues) =>
      adminApi.forceCancelPayment(paymentId, v.reason),
    {
      invalidates: ["payments"],
      successMessage: t("admin.finance.payments.forceCancelSuccess"),
      onSuccess: onClose,
    },
  );

  return (
    <FormModal
      open
      onClose={onClose}
      title={t("admin.finance.payments.forceCancel")}
      size="md"
      form={form}
      onSubmit={(v) => cancel.mutate(v)}
      isSubmitting={cancel.isPending}
      submitLabel={t("admin.finance.payments.forceCancelConfirm")}
      destructive
    >
      <p className="text-muted">
        {t("admin.finance.payments.forceCancelDescription")}
      </p>
      <FormTextarea
        name="reason"
        label={t("admin.finance.payments.cancelReasonRequired")}
        rows={3}
        placeholder={t("admin.finance.payments.cancelReasonPlaceholder")}
      />
    </FormModal>
  );
}

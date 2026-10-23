"use client";

import { Alert } from "@tarodan/ui";
import {
  FormCheckbox,
  FormError,
  FormModal,
  FormTextarea,
  useZodForm,
} from "@tarodan/ui/form";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { adminApi } from "@/lib/api";
import { DataList, Field } from "@/components/detail/DataList";
import { useFormModalLabels } from "@/hooks/useFormModalLabels";
import { usePayoutTransferAction } from "../_hooks/usePayoutTransferAction";
import { retryTransferBody } from "../_lib/resolution";
import { retryTransferSchema, type RetryTransferValues } from "../_lib/schema";
import type { PayoutTransferRow } from "../_lib/types";

/**
 * Retry of a transfer PayTR may have taken (`resolution.
 * retryRequiresProviderCheck`): sent only after the admin confirms the PayTR
 * panel shows no transfer with this transaction ID, with a reason.
 */
export function RetryTransferModal({
  row,
  onClose,
}: {
  row: PayoutTransferRow;
  onClose: () => void;
}) {
  const t = useTranslations();
  const modalLabels = useFormModalLabels();
  const form = useZodForm(retryTransferSchema(t), {
    defaultValues: { confirmProviderChecked: false, reason: "" },
  });
  const retry = usePayoutTransferAction(
    (values: RetryTransferValues) =>
      adminApi.retryPayoutTransfer(row.id, retryTransferBody(values)),
    {
      onSuccess: () => {
        toast.success(t("admin.finance.payouts.transferRetried"));
        onClose();
      },
      onStale: onClose,
      onError: (error) =>
        form.setError(error.field === "reason" ? "reason" : "root", {
          message: error.message,
        }),
    },
  );

  return (
    <FormModal
      {...modalLabels}
      open
      onClose={onClose}
      title={t("admin.finance.payouts.resolution.retryTitle")}
      size="md"
      form={form}
      onSubmit={retry.submit}
      isSubmitting={retry.isPending}
      submitLabel={t("admin.finance.payouts.retryTransfer")}
    >
      <Alert variant="warning">
        {t("admin.finance.payouts.resolution.retryUnknownWarning")}
      </Alert>
      <DataList columns={1}>
        <Field label={t("admin.finance.payouts.resolution.transId")}>
          {row.transId}
        </Field>
      </DataList>
      <p className="text-sm text-muted">
        {t("admin.finance.payouts.resolution.retryRecomputeNote")}
      </p>
      <FormCheckbox
        name="confirmProviderChecked"
        label={t("admin.finance.payouts.resolution.confirmProviderChecked")}
      />
      <FormTextarea
        name="reason"
        label={t("common.reason")}
        rows={3}
        maxLength={500}
        placeholder={t("admin.finance.payouts.resolution.reasonPlaceholder")}
      />
      <FormError />
    </FormModal>
  );
}

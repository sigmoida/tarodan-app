"use client";

import { Alert } from "@tarodan/ui";
import {
  FormCheckbox,
  FormError,
  FormInput,
  FormModal,
  FormTextarea,
  useZodForm,
} from "@tarodan/ui/form";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { adminApi } from "@/lib/api";
import type { MarkPayoutTransferPaidBody } from "@/lib/api/finance";
import { DataList, Field } from "@/components/detail/DataList";
import { useFormModalLabels } from "@/hooks/useFormModalLabels";
import { fmtTry } from "@/lib/format";
import { usePayoutTransferAction } from "../_hooks/usePayoutTransferAction";
import { failureReasonText } from "../_lib/failureReason";
import { markPaidBody } from "../_lib/resolution";
import { markPaidSchema, type MarkPaidValues } from "../_lib/schema";
import type { PayoutTransferRow } from "../_lib/types";
import { TransferTotalBreakdown } from "../_components/TransferTotalBreakdown";

/**
 * "Mark as paid": records a failed transfer as paid without PayTR. The
 * method and the net are the API's (`row.resolution`): `paytr_confirmed`
 * when the PayTR panel shows the transfer arrived, `external_bank` when the
 * platform paid the net from the company bank account. The admin gives the
 * reference and a reason and types the net again to confirm. Mount only for
 * a row whose `resolution.markPaidMethod` is set.
 */
export function MarkPaidModal({
  row,
  onClose,
}: {
  row: PayoutTransferRow;
  onClose: () => void;
}) {
  const t = useTranslations();
  const modalLabels = useFormModalLabels();
  const method = row.resolution.markPaidMethod;
  const net = row.resolution.markPaidNetAmount ?? 0;
  const requiresProviderCheck = row.resolution.markPaidRequiresProviderCheck;
  const form = useZodForm(markPaidSchema(t, net, requiresProviderCheck), {
    defaultValues: {
      confirmProviderChecked: false,
      reference: "",
      reason: "",
      typedAmount: "",
    },
  });
  const markPaid = usePayoutTransferAction(
    (body: MarkPayoutTransferPaidBody) =>
      adminApi.markPayoutTransferPaid(row.id, body),
    {
      onSuccess: (res) => {
        toast.success(
          res?.data?.alreadySettled
            ? t("admin.finance.payouts.resolution.alreadyMarkedPaid")
            : t("admin.finance.payouts.resolution.markedPaid"),
        );
        onClose();
      },
      onStale: onClose,
      onError: (error) =>
        form.setError(error.field ?? "root", { message: error.message }),
    },
  );

  const submit = (values: MarkPaidValues) => {
    const body = markPaidBody(row.resolution, values);
    if (body) markPaid.submit(body);
  };

  if (!method) return null;
  const reason = failureReasonText(row.failureReason, t);

  return (
    <FormModal
      {...modalLabels}
      open
      onClose={onClose}
      title={t("admin.finance.payouts.resolution.markPaid")}
      size="md"
      form={form}
      onSubmit={submit}
      isSubmitting={markPaid.isPending}
      submitLabel={t("admin.finance.payouts.resolution.markPaid")}
      destructive
    >
      <Alert
        variant={method === "external_bank" ? "warning" : "info"}
        title={t(`admin.finance.payouts.resolution.method.${method}`)}
      >
        {t(`admin.finance.payouts.resolution.markPaidHelp.${method}`)}
      </Alert>
      <DataList columns={1}>
        <Field label={t("admin.finance.payouts.resolution.transId")}>
          {row.transId}
        </Field>
        {reason && (
          <Field label={t("admin.finance.payouts.resolution.failureReason")}>
            {reason}
          </Field>
        )}
        <Field label={t("admin.finance.payouts.resolution.markPaidNet")}>
          {fmtTry(net)}
        </Field>
      </DataList>
      {method === "external_bank" && row.transferTotal && (
        <TransferTotalBreakdown total={row.transferTotal} />
      )}
      {requiresProviderCheck && (
        <>
          <Alert variant="warning">
            {t("server.admin.payout.markPaidProviderCheckRequired")}
          </Alert>
          <FormCheckbox
            name="confirmProviderChecked"
            label={t("admin.finance.payouts.resolution.confirmProviderChecked")}
          />
        </>
      )}
      <FormInput
        name="reference"
        label={t(
          `admin.finance.payouts.resolution.markPaidReference.${method}`,
        )}
        maxLength={120}
        autoComplete="off"
      />
      <FormTextarea
        name="reason"
        label={t("common.reason")}
        rows={3}
        maxLength={500}
        placeholder={t("admin.finance.payouts.resolution.reasonPlaceholder")}
      />
      <FormInput
        name="typedAmount"
        label={t("admin.finance.payouts.resolution.markPaidTypedConfirm", {
          amount: fmtTry(net) ?? "",
        })}
        inputMode="decimal"
        autoComplete="off"
      />
      <FormError />
    </FormModal>
  );
}

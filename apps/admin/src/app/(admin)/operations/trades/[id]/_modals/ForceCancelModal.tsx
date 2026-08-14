"use client";

import { useTranslations } from "next-intl";
import {
  FormModal,
  FormTextarea,
  FormCheckbox,
  useZodForm,
} from "@tarodan/ui/form";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import {
  forceCancelTradeSchema,
  type ForceCancelTradeValues,
} from "../_lib/schema";

const RESET_VALUES: ForceCancelTradeValues = {
  reason: "",
  sendArrivedItemBack: true,
};

export function ForceCancelModal({
  open,
  onClose,
  tradeId,
}: {
  open: boolean;
  onClose: () => void;
  tradeId: string;
}) {
  const t = useTranslations();
  const form = useZodForm(forceCancelTradeSchema(t), {
    defaultValues: RESET_VALUES,
  });

  const forceCancel = useAdminMutation(
    (v: ForceCancelTradeValues) =>
      adminApi.forceCancelStuckTrade(tradeId, {
        reason: v.reason.trim(),
        sendArrivedItemBack: v.sendArrivedItemBack,
      }),
    {
      invalidates: ["trades"],
      successMessage: t("admin.operations.trades.forceCancelMsg"),
      onSuccess: onClose,
    },
  );

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={t("admin.operations.trades.forceCancelTitle")}
      form={form}
      onSubmit={(v) => forceCancel.mutate(v)}
      isSubmitting={forceCancel.isPending}
      submitLabel={t("admin.operations.trades.forceCancelTitle")}
      destructive
      resetValues={RESET_VALUES}
    >
      <p className="text-sm text-body">
        {t("admin.operations.trades.forceCancelBody")}
      </p>
      <FormTextarea
        name="reason"
        label={t("admin.operations.trades.cancelReasonLabel")}
        rows={3}
        placeholder={t("admin.operations.trades.forceCancelPlaceholder")}
      />
      <FormCheckbox
        name="sendArrivedItemBack"
        label={t("admin.operations.trades.sendBackLabel")}
      />
    </FormModal>
  );
}

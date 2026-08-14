"use client";

import { useTranslations } from "next-intl";
import {
  FormModal,
  FormSelect,
  FormTextarea,
  useZodForm,
} from "@tarodan/ui/form";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import {
  resolveDisputeSchema,
  type ResolveDisputeValues,
} from "../_lib/schema";

const RESET_VALUES: ResolveDisputeValues = {
  resolution: "complete_trade",
  note: "",
};

export function ResolveDisputeModal({
  open,
  onClose,
  tradeId,
}: {
  open: boolean;
  onClose: () => void;
  tradeId: string;
}) {
  const t = useTranslations();
  const form = useZodForm(resolveDisputeSchema(t), {
    defaultValues: RESET_VALUES,
  });

  const resolve = useAdminMutation(
    (v: ResolveDisputeValues) =>
      adminApi.resolveTradeDispute(tradeId, v.resolution, v.note.trim()),
    {
      invalidates: ["trades"],
      successMessage: t("admin.operations.trades.resolvedMsg"),
      errorMessage: t("admin.operations.trades.resolveFailed"),
      onSuccess: onClose,
    },
  );

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={t("admin.operations.trades.resolveTitle")}
      form={form}
      onSubmit={(v) => resolve.mutate(v)}
      isSubmitting={resolve.isPending}
      submitLabel={t("admin.operations.trades.resolve")}
      resetValues={RESET_VALUES}
    >
      <FormSelect
        name="resolution"
        label={t("admin.operations.trades.resolution")}
      >
        <option value="complete_trade">
          {t("admin.operations.trades.resolveComplete")}
        </option>
        <option value="compensate_initiator">
          {t("admin.operations.trades.compensateInitiator")}
        </option>
        <option value="compensate_receiver">
          {t("admin.operations.trades.compensateReceiver")}
        </option>
        <option value="compensate_both">
          {t("admin.operations.trades.compensateBoth")}
        </option>
      </FormSelect>
      <FormTextarea
        name="note"
        label={t("admin.operations.trades.resolutionNoteLabel")}
        rows={3}
        placeholder={t("admin.operations.trades.resolutionPlaceholder")}
      />
    </FormModal>
  );
}

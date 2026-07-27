"use client";

import { useTranslations } from "next-intl";
import {
  FormModal,
  FormInput,
  FormCheckbox,
  useZodForm,
} from "@tarodan/ui/form";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import {
  type ShippingTariff,
  type TariffFormValues,
  tariffSchema,
  tariffToForm,
  tariffFormToPayload,
} from "../_lib/types";

/**
 * Create a new draft tariff, or edit an existing DRAFT one. Active/archived tariffs
 * are immutable (a new draft is created and activated instead). Mount with a stable
 * `key` so useZodForm reseeds defaults per open.
 */
export function TariffFormModal({
  open,
  onClose,
  tariff,
}: {
  open: boolean;
  onClose: () => void;
  tariff?: ShippingTariff | null;
}) {
  const t = useTranslations();
  const isEdit = !!tariff;
  const form = useZodForm(tariffSchema(t), {
    defaultValues: tariffToForm(tariff ?? undefined),
  });

  const save = useAdminMutation(
    async (v: TariffFormValues) => {
      const payload = tariffFormToPayload(v);
      if (isEdit && tariff) {
        await adminApi.updateShippingTariff(tariff.id, payload);
      } else {
        await adminApi.createShippingTariff(payload);
      }
    },
    {
      invalidates: ["shipping-tariffs"],
      successMessage: isEdit
        ? t("admin.shippingTariffs.updated")
        : t("admin.shippingTariffs.created"),
      onSuccess: onClose,
    },
  );

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={
        isEdit
          ? t("admin.shippingTariffs.editTitle")
          : t("admin.shippingTariffs.newTitle")
      }
      form={form}
      onSubmit={(v) => save.mutate(v)}
      isSubmitting={save.isPending}
      submitLabel={
        isEdit
          ? t("admin.shippingTariffs.update")
          : t("admin.shippingTariffs.create")
      }
      maxWidth="max-w-lg"
    >
      <FormInput name="name" label={t("admin.shippingTariffs.nameLabel")} />
      <div className="grid grid-cols-2 gap-4">
        <FormInput
          name="outboundPackageFee"
          label={t("admin.shippingTariffs.outboundFeeLabel")}
          type="number"
          step="0.01"
          min="0"
        />
        <FormInput
          name="freeShippingThreshold"
          label={t("admin.shippingTariffs.thresholdLabel")}
          type="number"
          step="0.01"
          min="0"
        />
      </div>
      <FormCheckbox
        name="freeShippingEnabled"
        label={t("admin.shippingTariffs.freeEnabledLabel")}
      />
      <div className="grid grid-cols-2 gap-4">
        <FormInput
          name="returnPackageFee"
          label={t("admin.shippingTariffs.returnFeeLabel")}
          type="number"
          step="0.01"
          min="0"
        />
        <FormInput
          name="tradeLegFee"
          label={t("admin.shippingTariffs.tradeFeeLabel")}
          type="number"
          step="0.01"
          min="0"
        />
      </div>
    </FormModal>
  );
}

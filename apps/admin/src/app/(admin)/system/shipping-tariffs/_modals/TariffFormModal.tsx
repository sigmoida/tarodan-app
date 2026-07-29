"use client";

import { useTranslations } from "next-intl";
import {
  FormModal,
  FormInput,
  FormCheckbox,
  useZodForm,
} from "@tarodan/ui/form";
import { Button } from "@tarodan/ui";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useFieldArray, useFormContext } from "react-hook-form";
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
      size="2xl"
    >
      <FormInput name="name" label={t("admin.shippingTariffs.nameLabel")} />
      <ShippingRateRows />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

function ShippingRateRows() {
  const t = useTranslations();
  const { control } = useFormContext<TariffFormValues>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: "rates",
  });

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-heading">
            {t("admin.shippingTariffs.ratesTitle")}
          </p>
          <p className="text-xs text-muted">
            {t("admin.shippingTariffs.ratesHelper")}
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          leftIcon={<PlusIcon className="h-4 w-4" />}
          onClick={() => append({ desi: "", amount: "" })}
        >
          {t("admin.shippingTariffs.addRate")}
        </Button>
      </div>
      <div className="space-y-2">
        {fields.map((field, index) => (
          <div
            key={field.id}
            className="grid grid-cols-[1fr_1fr_auto] items-end gap-3"
          >
            <FormInput
              name={`rates.${index}.desi`}
              label={t("admin.shippingTariffs.desiLabel")}
              type="number"
              min="1"
              max="20000"
              step="1"
            />
            <FormInput
              name={`rates.${index}.amount`}
              label={t("admin.shippingTariffs.amountLabel")}
              type="number"
              min="0"
              step="0.01"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={t("admin.shippingTariffs.removeRate")}
              disabled={fields.length === 1}
              onClick={() => remove(index)}
            >
              <TrashIcon className="h-4 w-4 text-danger" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

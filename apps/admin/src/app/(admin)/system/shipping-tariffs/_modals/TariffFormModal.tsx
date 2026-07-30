"use client";

import { useTranslations } from "next-intl";
import {
  FormModal,
  FormInput,
  FormCheckbox,
  useZodForm,
} from "@tarodan/ui/form";
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
    defaultValues: tariffToForm(t, tariff ?? undefined),
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
      <FormInput
        name="name"
        label={t("admin.shippingTariffs.nameLabel")}
        placeholder={t("admin.shippingTariffs.namePlaceholder")}
      />
      <PackageTierRows />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormInput
          name="freeShippingThreshold"
          label={t("admin.shippingTariffs.thresholdLabel")}
          type="number"
          step="0.01"
          min="0"
          placeholder="1000"
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
          placeholder="100"
        />
        <FormInput
          name="tradeLegFee"
          label={t("admin.shippingTariffs.tradeFeeLabel")}
          type="number"
          step="0.01"
          min="0"
          placeholder="100"
        />
      </div>
    </FormModal>
  );
}

/**
 * Üç paket boyutunun editörü. Kademe sayısı sabittir (satıcı üç seçenek görür),
 * bu yüzden satır ekleme/çıkarma yoktur — yalnız etiket, desi aralığı, tutar ve
 * satıcıya ipucu olarak gösterilecek örnek ölçü düzenlenir.
 *
 * Desi aralığı BURADA kalır: satıcı hiç desi görmez, yalnız boyut seçer.
 */
function PackageTierRows() {
  const t = useTranslations();
  const { control } = useFormContext<TariffFormValues>();
  const { fields } = useFieldArray({ control, name: "packageTiers" });

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-heading">
          {t("admin.shippingTariffs.tiersTitle")}
        </p>
        <p className="text-xs text-muted">
          {t("admin.shippingTariffs.tiersHelper")}
        </p>
      </div>
      <div className="space-y-4">
        {fields.map((field, index) => (
          <div
            key={field.id}
            className="space-y-3 rounded-lg border border-border p-4"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <FormInput
                name={`packageTiers.${index}.label`}
                label={t("admin.shippingTariffs.tierLabel")}
                placeholder={t("admin.shippingTariffs.tierLabelPlaceholder")}
              />
              <FormInput
                name={`packageTiers.${index}.minDesi`}
                label={t("admin.shippingTariffs.minDesiLabel")}
                type="number"
                min="0"
                step="1"
              />
              <FormInput
                name={`packageTiers.${index}.maxDesi`}
                label={t("admin.shippingTariffs.maxDesiLabel")}
                type="number"
                min="1"
                step="1"
                helperText={
                  index === fields.length - 1
                    ? t("admin.shippingTariffs.unboundedHelper")
                    : undefined
                }
              />
              <FormInput
                name={`packageTiers.${index}.amount`}
                label={t("admin.shippingTariffs.amountLabel")}
                type="number"
                min="0"
                step="0.01"
                placeholder="100"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FormInput
                name={`packageTiers.${index}.sampleWidth`}
                label={t("admin.shippingTariffs.sampleWidthLabel")}
                type="number"
                min="1"
                step="1"
                placeholder={t("common.optional")}
              />
              <FormInput
                name={`packageTiers.${index}.sampleHeight`}
                label={t("admin.shippingTariffs.sampleHeightLabel")}
                type="number"
                min="1"
                step="1"
                placeholder={t("common.optional")}
              />
              <FormInput
                name={`packageTiers.${index}.sampleLength`}
                label={t("admin.shippingTariffs.sampleLengthLabel")}
                type="number"
                min="1"
                step="1"
                placeholder={t("common.optional")}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useFieldArray, useFormContext } from "react-hook-form";
import { Button } from "@tarodan/ui";
import { FormInput, FormDatePicker, FormCheckbox } from "@tarodan/ui/form";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { emptyTierRow, type PackageFormValues } from "../_lib/types";

/**
 * "Satır ekle / çıkar" tier matrix editor. Each row prices one duration ×
 * product-price-range combination; rows can be freely added/removed so admins
 * define fully dynamic packages (any duration, any number of ranges).
 */
export function TierRowsEditor() {
  const t = useTranslations();
  const { control } = useFormContext<PackageFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "tiers" });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-heading">
            {t("admin.marketing.adPackages.tiers")}
          </p>
          <p className="text-xs text-muted">
            {t("admin.marketing.adPackages.tiersHelper")}
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          leftIcon={<PlusIcon className="h-4 w-4" />}
          onClick={() => append({ ...emptyTierRow })}
        >
          {t("admin.marketing.adPackages.addTier")}
        </Button>
      </div>

      {fields.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted">
          {t("admin.marketing.adPackages.noTiers")}
        </p>
      )}

      <div className="space-y-3">
        {fields.map((field, index) => (
          <div
            key={field.id}
            className="rounded-lg border border-border bg-surface-alt/40 p-3"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <FormInput
                name={`tiers.${index}.durationDays`}
                type="number"
                min="1"
                label={t("admin.marketing.adPackages.durationDays")}
                placeholder="7"
              />
              <FormInput
                name={`tiers.${index}.minAmount`}
                type="number"
                min="0"
                step="0.01"
                label={t("admin.marketing.adPackages.minAmount")}
                placeholder="0"
              />
              <FormInput
                name={`tiers.${index}.maxAmount`}
                type="number"
                min="0"
                step="0.01"
                label={t("admin.marketing.adPackages.maxAmount")}
                placeholder={t("admin.marketing.adPackages.unlimited")}
              />
              <FormInput
                name={`tiers.${index}.price`}
                type="number"
                min="0"
                step="0.01"
                label={t("admin.marketing.adPackages.price")}
                placeholder="49.90"
              />
              <FormInput
                name={`tiers.${index}.campaignPrice`}
                type="number"
                min="0"
                step="0.01"
                label={t("admin.marketing.adPackages.campaignPrice")}
                placeholder="39.90"
              />
              <FormDatePicker
                name={`tiers.${index}.campaignStartsAt`}
                label={t("admin.marketing.adPackages.campaignStartsAt")}
              />
              <FormDatePicker
                name={`tiers.${index}.campaignEndsAt`}
                label={t("admin.marketing.adPackages.campaignEndsAt")}
              />
              <div className="flex items-end justify-between gap-2">
                <FormCheckbox
                  name={`tiers.${index}.isActive`}
                  label={t("admin.marketing.adPackages.tierActive")}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={t("admin.marketing.adPackages.removeTier")}
                  onClick={() => remove(index)}
                >
                  <TrashIcon className="h-4 w-4 text-danger" />
                </Button>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted">
              {t("admin.marketing.adPackages.campaignHelper")}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

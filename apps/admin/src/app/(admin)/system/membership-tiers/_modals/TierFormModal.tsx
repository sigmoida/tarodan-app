"use client";

import { useTranslations } from "next-intl";
import {
  FormModal,
  FormInput,
  FormTextarea,
  FormCheckbox,
  useZodForm,
} from "@tarodan/ui/form";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { fmtTry } from "@/lib/format";
import {
  type MembershipTier,
  type TierFormValues,
  tierSchema,
  tierToForm,
  tierFormToPayload,
  computedYearly,
} from "../_lib/types";

/** Edit a membership tier. Mount with `key={tier.id}` so defaults seed fresh. */
export function TierFormModal({
  open,
  onClose,
  tier,
  yearlyDiscount,
}: {
  open: boolean;
  onClose: () => void;
  tier: MembershipTier;
  yearlyDiscount: number;
}) {
  const t = useTranslations();
  const isFree = tier.type === "free";
  const form = useZodForm(tierSchema(t), { defaultValues: tierToForm(tier) });
  const monthly = parseFloat(form.watch("monthlyPrice")) || 0;
  const yearly = computedYearly(monthly, yearlyDiscount);

  const save = useAdminMutation(
    async (v: TierFormValues) => {
      await adminApi.updateMembershipTier(
        tier.id,
        tierFormToPayload(
          v,
          computedYearly(parseFloat(v.monthlyPrice) || 0, yearlyDiscount),
        ),
      );
    },
    {
      invalidates: ["membership-tiers"],
      successMessage: t("admin.tiers.modal.saved"),
      onSuccess: onClose,
    },
  );

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={t("admin.tiers.modal.editTitle", { name: tier.name })}
      form={form}
      onSubmit={(v) => save.mutate(v)}
      isSubmitting={save.isPending}
      submitLabel={t("common.update")}
      size="2xl"
    >
      <div className="grid grid-cols-2 gap-4">
        <FormInput
          name="name"
          label={t("admin.tiers.field.name")}
          placeholder={t("admin.tiers.field.namePlaceholder")}
        />
        <FormInput
          name="sortOrder"
          label={t("admin.tiers.field.sortOrder")}
          type="number"
          placeholder="0"
        />
      </div>

      <FormTextarea
        name="description"
        label={t("common.description")}
        placeholder={t("admin.tiers.field.descriptionPlaceholder")}
        rows={2}
      />

      {!isFree && (
        <div className="grid grid-cols-2 gap-4">
          <FormInput
            name="monthlyPrice"
            label={t("admin.tiers.field.monthlyPrice")}
            type="number"
            step="0.01"
            min="0"
            placeholder="99.90"
          />
          <div>
            <span className="mb-1 block text-sm text-muted">
              {t("admin.tiers.field.yearlyPrice")}{" "}
              <span className="text-xs text-subtle">
                {t("admin.tiers.field.automatic")}
              </span>
            </span>
            <div className="rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-muted">
              {fmtTry(yearly)}
            </div>
            <p className="mt-1 text-xs text-subtle">
              {t("admin.tiers.field.yearlyFormula", {
                monthly,
                discount: yearlyDiscount,
                yearly: fmtTry(yearly),
              })}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <FormInput
          name="maxFreeListings"
          label={t("admin.tiers.field.maxFreeListings")}
          type="number"
          placeholder="5"
        />
        <FormInput
          name="maxTotalListings"
          label={t("admin.tiers.field.maxTotalListings")}
          type="number"
          min="-1"
          placeholder="-1"
          helperText={t("admin.tiers.field.maxTotalListingsHelper")}
        />
        <FormInput
          name="maxImagesPerListing"
          label={t("admin.tiers.field.maxImagesPerListing")}
          type="number"
          placeholder="10"
        />
      </div>

      {/* featuredListingSlots + commissionDiscount removed: the former is superseded
          by the paid ad-packages boost system, the latter was never applied by the
          commission engine (commission-rules-v2). Both were misleading admin knobs. */}

      <div className="space-y-2">
        <FormCheckbox
          name="canCreateCollections"
          label={t("admin.tiers.field.canCreateCollections")}
        />
        <FormCheckbox name="canTrade" label={t("admin.tiers.field.canTrade")} />
        <FormCheckbox name="isAdFree" label={t("admin.tiers.field.isAdFree")} />
        <FormCheckbox name="isActive" label={t("common.active")} />
      </div>
    </FormModal>
  );
}

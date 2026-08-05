"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useFormContext } from "react-hook-form";
import { Slider } from "@tarodan/ui";
import {
  FormError,
  FormInput,
  FormModal,
  FormSelect,
  useZodForm,
} from "@tarodan/ui/form";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { useCategories } from "@/hooks/useCategories";
import { extractErrorMessage } from "@/lib/error";
import {
  commissionFormToPayload,
  commissionSchema,
  emptyCommissionForm,
  ruleToForm,
  sellerTypes,
  type CommissionFormValues,
  type CommissionRule,
} from "../_lib/types";

function RateBlock({
  title,
  rateName,
  minName,
  maxName,
}: {
  title: string;
  rateName: string;
  minName: string;
  maxName: string;
}) {
  const t = useTranslations();
  const form = useFormContext<CommissionFormValues>();
  const rate = form.watch(rateName as keyof CommissionFormValues);
  const boundsDisabled = Number(rate) === 0;

  useEffect(() => {
    if (!boundsDisabled) return;
    for (const field of [minName, maxName]) {
      const name = field as keyof CommissionFormValues;
      if (form.getValues(name)) {
        form.setValue(name, "" as never, { shouldValidate: true });
      }
    }
  }, [boundsDisabled, form, minName, maxName]);

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <h3 className="text-sm font-medium text-heading">{title}</h3>
      <div className="grid grid-cols-3 gap-3">
        <FormInput
          name={rateName}
          label={t("admin.finance.commission.ratePercent")}
          type="number"
          step="0.01"
          min="0"
          max="100"
        />
        <FormInput
          name={minName}
          label={t("admin.finance.commission.minTl")}
          type="number"
          step="0.01"
          min="0"
          disabled={boundsDisabled}
          placeholder={t("admin.finance.commission.noFloor")}
        />
        <FormInput
          name={maxName}
          label={t("admin.finance.commission.maxTl")}
          type="number"
          step="0.01"
          min="0"
          disabled={boundsDisabled}
          placeholder={t("admin.finance.commission.noCap")}
        />
      </div>
    </div>
  );
}

const clampShare = (value: number) => Math.min(100, Math.max(0, value));

/**
 * Number input + interactive split slider. Tier rows may stay empty and inherit
 * the default; moving their slider creates an explicit override.
 */
function ShippingShareRow({
  label,
  name,
  buyerShare,
  inherited,
  placeholder,
}: {
  label: string;
  name: keyof CommissionFormValues;
  buyerShare: number;
  inherited: boolean;
  placeholder: string;
}) {
  const t = useTranslations();
  const form = useFormContext<CommissionFormValues>();
  const roundedBuyerShare = Math.round(buyerShare * 100) / 100;
  const sellerShare = Math.round((100 - roundedBuyerShare) * 100) / 100;

  return (
    <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[minmax(9rem,12rem)_6rem_1fr]">
      <span className="text-sm text-body">{label}</span>
      <FormInput
        name={name}
        type="number"
        step="1"
        min="0"
        max="100"
        placeholder={placeholder}
        aria-label={label}
      />
      <div className="min-w-0">
        <div className="mb-1 flex justify-between gap-2 text-xs">
          <span className={inherited ? "text-subtle" : "text-body"}>
            {t("admin.finance.common.buyer")} %{roundedBuyerShare}
            {inherited && (
              <span> ({t("admin.finance.commission.usesDefaultShare")})</span>
            )}
          </span>
          <span className={inherited ? "text-subtle" : "text-body"}>
            {t("admin.finance.common.seller")} %{sellerShare}
          </span>
        </div>
        <Slider
          min={0}
          max={100}
          step={1}
          value={roundedBuyerShare}
          aria-label={label}
          className={inherited ? "opacity-60" : undefined}
          onChange={(event) =>
            form.setValue(name, event.target.value as never, {
              shouldDirty: true,
              shouldTouch: true,
              shouldValidate: true,
            })
          }
        />
      </div>
    </div>
  );
}

/** Default shipping split followed by optional per-package overrides. */
function ShippingSplitSection() {
  const t = useTranslations();
  const form = useFormContext<CommissionFormValues>();
  const values = form.watch();
  const rawDefault = String(values.shippingBuyerShare ?? "");
  const hasDefault = rawDefault.trim() !== "";
  const defaultShare = hasDefault ? clampShare(Number(rawDefault) || 0) : 100;
  const tiers: Array<{
    name: keyof CommissionFormValues;
    label: string;
  }> = [
    {
      name: "shippingShareSmall",
      label: t("admin.finance.commission.tierSmall"),
    },
    {
      name: "shippingShareMedium",
      label: t("admin.finance.commission.tierMedium"),
    },
    {
      name: "shippingShareLarge",
      label: t("admin.finance.commission.tierLarge"),
    },
  ];

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div>
        <h3 className="text-sm font-medium text-heading">
          {t("admin.finance.commission.shippingSharesTitle")}
        </h3>
        <p className="text-xs text-muted">
          {t("admin.finance.commission.shippingSharesHelper")}
        </p>
      </div>

      <ShippingShareRow
        label={t("admin.finance.commission.defaultShareLabel")}
        name="shippingBuyerShare"
        buyerShare={defaultShare}
        inherited={!hasDefault}
        placeholder="100"
      />

      <div className="border-t border-border pt-4">
        <p className="mb-3 text-xs font-medium text-muted">
          {t("admin.finance.commission.tierOverridesTitle")} —{" "}
          {t("admin.finance.commission.tierOverridesHint")}
        </p>
        <div className="space-y-4">
          {tiers.map((tier) => {
            const rawShare = String(values[tier.name] ?? "");
            const hasOverride = rawShare.trim() !== "";
            const buyerShare = hasOverride
              ? clampShare(Number(rawShare) || 0)
              : defaultShare;
            return (
              <ShippingShareRow
                key={tier.name}
                label={tier.label}
                name={tier.name}
                buyerShare={buyerShare}
                inherited={!hasOverride}
                placeholder={String(defaultShare)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function CommissionRuleFormModal({
  open,
  onClose,
  rule,
}: {
  open: boolean;
  onClose: () => void;
  rule?: CommissionRule;
}) {
  const t = useTranslations();
  const isEdit = Boolean(rule);
  const form = useZodForm(commissionSchema(t), {
    defaultValues: rule ? ruleToForm(rule) : emptyCommissionForm,
  });
  const { data: categories = [] } = useCategories();

  const save = useAdminMutation(
    (values: CommissionFormValues) =>
      isEdit
        ? adminApi.updateCommissionRule(
            rule!.id,
            commissionFormToPayload(values),
          )
        : adminApi.createCommissionRule(commissionFormToPayload(values)),
    {
      invalidates: ["commission-rules", "commission-rule-sets"],
      successMessage: isEdit
        ? t("admin.finance.commission.ruleUpdated")
        : t("admin.finance.commission.ruleCreated"),
      errorMessage: t("admin.finance.commission.saveFailed"),
      onSuccess: onClose,
    },
  );

  const categoryOptions = categories.map((category) => ({
    value: category.id,
    label: category.name,
  }));
  if (
    rule &&
    !categoryOptions.some((option) => option.value === rule.categoryId)
  ) {
    categoryOptions.push({
      value: rule.categoryId,
      label: rule.categoryName || t("common.loading"),
    });
  }

  const submit = (values: CommissionFormValues) => {
    form.clearErrors("root");
    save.mutate(values, {
      onError: (error) =>
        form.setError("root", {
          type: "server",
          message: extractErrorMessage(
            error,
            t("admin.finance.commission.saveFailed"),
          ),
        }),
    });
  };

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={
        isEdit
          ? t("admin.finance.commission.editRule")
          : t("admin.finance.commission.newRule")
      }
      form={form}
      onSubmit={submit}
      isSubmitting={save.isPending}
      submitLabel={isEdit ? t("common.update") : t("common.create")}
      size="2xl"
    >
      <FormError />
      <FormInput
        name="name"
        label={t("admin.finance.commission.ruleName")}
        placeholder={t("admin.finance.commission.ruleNamePlaceholder")}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormSelect
          name="categoryId"
          label={t("common.category")}
          options={categoryOptions}
        />
        <FormSelect
          name="sellerType"
          label={t("admin.finance.commission.sellerType")}
          options={sellerTypes(t)}
        />
      </div>

      <div className="rounded-lg border border-border p-4">
        <h3 className="mb-1 text-sm font-medium text-heading">
          {t("admin.finance.commission.amountRangeTitle")}
        </h3>
        <p className="mb-3 text-xs text-muted">
          {t("admin.finance.commission.amountRangeStrictHint")}
        </p>
        <div className="grid grid-cols-2 gap-4">
          <FormInput
            name="minAmount"
            label={t("admin.finance.commission.minAmountLabel")}
            type="number"
            step="0.01"
            min="0"
          />
          <FormInput
            name="maxAmount"
            label={t("admin.finance.commission.maxAmountLabel")}
            type="number"
            step="0.01"
            min="0.01"
            placeholder="∞"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RateBlock
          title={t("admin.finance.commission.sellerCommission")}
          rateName="sellerCommissionRate"
          minName="sellerCommissionMin"
          maxName="sellerCommissionMax"
        />
        <RateBlock
          title={t("admin.finance.commission.sellerPlatformFee")}
          rateName="sellerPlatformFeeRate"
          minName="sellerPlatformFeeMin"
          maxName="sellerPlatformFeeMax"
        />
        <RateBlock
          title={t("admin.finance.commission.buyerCommission")}
          rateName="buyerCommissionRate"
          minName="buyerCommissionMin"
          maxName="buyerCommissionMax"
        />
        <RateBlock
          title={t("admin.finance.commission.buyerServiceFee")}
          rateName="buyerServiceFeeRate"
          minName="buyerServiceFeeMin"
          maxName="buyerServiceFeeMax"
        />
      </div>

      <div className="space-y-3 rounded-lg border border-border p-4">
        <div>
          <h3 className="text-sm font-medium text-heading">
            {t("admin.finance.commission.tradeFeesTitle")}
          </h3>
          <p className="text-xs text-muted">
            {t("admin.finance.commission.tradeFeesHelper")}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormInput
            name="tradeFeeSellerAmount"
            label={t("admin.finance.commission.tradeFeeSeller")}
            type="number"
            step="0.01"
            min="0"
          />
          <FormInput
            name="tradeFeeBuyerAmount"
            label={t("admin.finance.commission.tradeFeeBuyer")}
            type="number"
            step="0.01"
            min="0"
          />
        </div>
      </div>

      <ShippingSplitSection />
    </FormModal>
  );
}

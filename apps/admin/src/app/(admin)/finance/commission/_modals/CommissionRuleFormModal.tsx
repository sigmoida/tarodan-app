"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useFormContext } from "react-hook-form";
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
          title={t("admin.finance.commission.buyerServiceFee")}
          rateName="buyerServiceFeeRate"
          minName="buyerServiceFeeMin"
          maxName="buyerServiceFeeMax"
        />
        <RateBlock
          title={t("admin.finance.commission.buyerCommission")}
          rateName="buyerCommissionRate"
          minName="buyerCommissionMin"
          maxName="buyerCommissionMax"
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

      <div className="space-y-3 rounded-lg border border-border p-4">
        <h3 className="text-sm font-medium text-heading">
          {t("admin.finance.commission.shippingSplitTitle")}
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <FormInput
            name="shippingBuyerShare"
            label={t("admin.finance.commission.defaultBuyerShare")}
            type="number"
            min="0"
            max="100"
          />
          <FormInput
            name="shippingShareSmall"
            label={t("admin.finance.commission.packageSmall")}
            type="number"
            min="0"
            max="100"
          />
          <FormInput
            name="shippingShareMedium"
            label={t("admin.finance.commission.packageMedium")}
            type="number"
            min="0"
            max="100"
          />
          <FormInput
            name="shippingShareLarge"
            label={t("admin.finance.commission.packageLarge")}
            type="number"
            min="0"
            max="100"
          />
        </div>
      </div>
    </FormModal>
  );
}

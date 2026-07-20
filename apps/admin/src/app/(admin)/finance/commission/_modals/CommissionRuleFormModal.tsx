"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useFormContext } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { Input, Select } from "@tarodan/ui";
import {
  FormModal,
  FormError,
  FormInput,
  FormSelect,
  FormCheckbox,
  useZodForm,
} from "@tarodan/ui/form";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { useCategories } from "@/hooks/useCategories";
import { fmtTry } from "@/lib/format";
import { adminKeys } from "@/lib/query/keys";
import {
  type CommissionRule,
  type CommissionFormValues,
  type Category,
  type SellerType,
  commissionSchema,
  emptyCommissionForm,
  ruleToForm,
  commissionFormToPayload,
  sellerTypes,
  appliesToOptions,
} from "../_lib/types";

interface CommissionPreview {
  sellerFeeAmount: number;
  buyerFeeAmount: number;
  commissionAmount: number;
}

function getApiErrorMessage(error: unknown, fallback: string): string {
  const message = (error as { response?: { data?: { message?: unknown } } })
    ?.response?.data?.message;

  if (typeof message === "string") return message;
  if (Array.isArray(message)) {
    const messages = message.filter(
      (item): item is string => typeof item === "string",
    );
    if (messages.length > 0) return messages.join(" ");
  }

  return fallback;
}

/** Live checkout-equivalent preview, including independently matched buyer/seller rules. */
function PreviewCalculator({
  ruleId,
  categories,
}: {
  ruleId?: string;
  categories: Category[];
}) {
  const t = useTranslations();
  const { watch } = useFormContext<CommissionFormValues>();
  const [price, setPrice] = useState("");
  const [debouncedPrice, setDebouncedPrice] = useState(0);
  const [previewCategoryId, setPreviewCategoryId] = useState("");
  const [previewSellerType, setPreviewSellerType] =
    useState<Exclude<SellerType, "ALL">>("FREE");
  const values = watch();

  useEffect(() => {
    const parsedPrice = parseFloat(price);
    const timer = setTimeout(
      () =>
        setDebouncedPrice(
          Number.isNaN(parsedPrice) || parsedPrice <= 0 ? 0 : parsedPrice,
        ),
      300,
    );
    return () => clearTimeout(timer);
  }, [price]);

  const effectiveCategoryId = values.categoryId || previewCategoryId;
  const effectiveSellerType =
    values.sellerType === "ALL" ? previewSellerType : values.sellerType;
  const hasRequiredRates =
    !(
      (values.appliesTo === "SELLER" || values.appliesTo === "BOTH") &&
      !values.sellerRate
    ) &&
    !(
      (values.appliesTo === "BUYER" || values.appliesTo === "BOTH") &&
      !values.buyerRate
    );
  const draft = commissionFormToPayload(values);

  const previewQuery = useQuery<CommissionPreview>({
    queryKey: adminKeys.preview("commission-rules", {
      ruleId: ruleId ?? "new",
      amount: debouncedPrice,
      categoryId: effectiveCategoryId,
      sellerType: effectiveSellerType,
      draft: {
        categoryId: draft.categoryId,
        sellerType: draft.sellerType,
        appliesTo: draft.appliesTo,
        sellerRate: draft.sellerRate,
        buyerRate: draft.buyerRate,
        sellerMin: draft.sellerMin,
        sellerMax: draft.sellerMax,
        buyerMin: draft.buyerMin,
        buyerMax: draft.buyerMax,
        isActive: draft.isActive,
      },
    }),
    queryFn: async () => {
      const response = await adminApi.previewCommission({
        amount: debouncedPrice,
        ruleId,
        categoryId: draft.categoryId,
        sellerType: draft.sellerType,
        appliesTo: draft.appliesTo,
        sellerRate: draft.sellerRate,
        buyerRate: draft.buyerRate,
        sellerMin: draft.sellerMin,
        sellerMax: draft.sellerMax,
        buyerMin: draft.buyerMin,
        buyerMax: draft.buyerMax,
        isActive: draft.isActive,
        previewCategoryId: effectiveCategoryId || null,
        previewSellerType: effectiveSellerType,
      });
      return response.data;
    },
    enabled: debouncedPrice > 0 && hasRequiredRates,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const preview = previewQuery.data;
  const categoryOptions = [
    { value: "", label: t("admin.finance.commission.noCategorySelected") },
    ...categories.map((category) => ({
      value: category.id,
      label: category.name,
    })),
  ];

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <h3 className="text-sm font-medium text-muted">
        {t("admin.finance.commission.previewCalculator")}
      </h3>
      <p className="text-xs text-muted">
        {t("admin.finance.commission.previewDescription")}
      </p>
      {values.categoryId === "" && (
        <Select
          label={t("admin.finance.commission.exampleCategory")}
          value={previewCategoryId}
          onChange={(event) => setPreviewCategoryId(event.target.value)}
          options={categoryOptions}
        />
      )}
      {values.sellerType === "ALL" && (
        <Select
          label={t("admin.finance.commission.exampleSellerType")}
          value={previewSellerType}
          onChange={(event) =>
            setPreviewSellerType(
              event.target.value as Exclude<SellerType, "ALL">,
            )
          }
          options={sellerTypes(t).filter((option) => option.value !== "ALL")}
        />
      )}
      <Input
        type="number"
        step="0.01"
        min="0"
        label={t("admin.finance.commission.examplePrice")}
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        placeholder="1000"
      />
      {previewQuery.isFetching && (
        <p className="text-sm text-muted">
          {t("admin.finance.commission.calculating")}
        </p>
      )}
      {previewQuery.isError && (
        <p className="text-sm text-danger-600">
          {t("admin.finance.commission.previewFailed")}
        </p>
      )}
      {preview && (
        <div className="space-y-2 rounded-lg bg-surface-alt p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">
              {t("admin.finance.commission.sellerCommission")}:
            </span>
            <span className="font-medium text-heading">
              {fmtTry(preview.sellerFeeAmount)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">
              {t("admin.finance.commission.buyerCommission")}:
            </span>
            <span className="font-medium text-heading">
              {fmtTry(preview.buyerFeeAmount)}
            </span>
          </div>
          <div className="flex justify-between border-t border-border pt-2">
            <span className="font-medium text-muted">
              {t("admin.finance.commission.totalCommission")}:
            </span>
            <span className="font-bold text-primary-700">
              {fmtTry(preview.commissionAmount)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Create/edit commission rule. Mount with `key={rule?.id ?? 'new'}` so defaults seed fresh. */
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
  const appliesTo = form.watch("appliesTo");
  const showSeller = appliesTo === "SELLER" || appliesTo === "BOTH";
  const showBuyer = appliesTo === "BUYER" || appliesTo === "BOTH";

  const { data: categories = [] } = useCategories();

  const save = useAdminMutation(
    (v: CommissionFormValues) =>
      isEdit
        ? adminApi.updateCommissionRule(rule!.id, commissionFormToPayload(v))
        : adminApi.createCommissionRule(commissionFormToPayload(v)),
    {
      invalidates: ["commission-rules"],
      successMessage: isEdit
        ? t("admin.finance.commission.ruleUpdated")
        : t("admin.finance.commission.ruleCreated"),
      showErrorToast: false,
      onSuccess: onClose,
    },
  );

  const categoryOptions = [
    { value: "", label: t("admin.finance.commission.allCategories") },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ];

  const submit = (values: CommissionFormValues) => {
    form.clearErrors("root");
    save.mutate(values, {
      onError: (error) => {
        form.setError("root", {
          type: "server",
          message: getApiErrorMessage(
            error,
            t("admin.finance.commission.saveFailed"),
          ),
        });
      },
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
      maxWidth="max-w-2xl"
    >
      <FormError />
      <FormInput name="name" label={t("admin.finance.commission.ruleName")} />
      <div className="grid grid-cols-2 gap-4">
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
      <FormSelect
        name="appliesTo"
        label={t("admin.finance.commission.appliesTo")}
        options={appliesToOptions(t)}
      />

      {showSeller && (
        <div className="space-y-4 rounded-lg border border-border p-4">
          <h3 className="text-sm font-medium text-muted">
            {t("admin.finance.commission.sellerCommission")}
          </h3>
          <FormInput
            name="sellerRate"
            label={t("admin.finance.commission.sellerRatePercent")}
            type="number"
            step="0.01"
          />
          <div className="grid grid-cols-2 gap-4">
            <FormInput
              name="sellerMin"
              label={t("admin.finance.commission.sellerMinimum")}
              type="number"
              step="0.01"
              placeholder={t("common.optional")}
            />
            <FormInput
              name="sellerMax"
              label={t("admin.finance.commission.sellerMaximum")}
              type="number"
              step="0.01"
              placeholder={t("common.optional")}
            />
          </div>
        </div>
      )}

      {showBuyer && (
        <div className="space-y-4 rounded-lg border border-border p-4">
          <h3 className="text-sm font-medium text-muted">
            {t("admin.finance.commission.buyerCommission")}
          </h3>
          <FormInput
            name="buyerRate"
            label={t("admin.finance.commission.buyerRatePercent")}
            type="number"
            step="0.01"
          />
          <div className="grid grid-cols-2 gap-4">
            <FormInput
              name="buyerMin"
              label={t("admin.finance.commission.buyerMinimum")}
              type="number"
              step="0.01"
              placeholder={t("common.optional")}
            />
            <FormInput
              name="buyerMax"
              label={t("admin.finance.commission.buyerMaximum")}
              type="number"
              step="0.01"
              placeholder={t("common.optional")}
            />
          </div>
        </div>
      )}

      <PreviewCalculator ruleId={rule?.id} categories={categories} />
      <FormCheckbox
        name="isActive"
        label={t("admin.finance.commission.ruleActive")}
      />
    </FormModal>
  );
}

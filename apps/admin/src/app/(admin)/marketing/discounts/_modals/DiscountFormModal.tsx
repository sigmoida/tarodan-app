"use client";

import {
  FormModal,
  FormInput,
  FormDatePicker,
  FormSelect,
  FormTextarea,
  FormCheckbox,
  useZodForm,
} from "@tarodan/ui/form";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { useCategories } from "@/hooks/useCategories";
import { discountSchema, type DiscountFormValues } from "../_lib/schema";
import {
  discountTypeOptions,
  scopeFormOptions,
  type Discount,
} from "../_lib/types";
import { useTranslations } from "next-intl";

const isoDate = (offsetDays = 0) =>
  new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

/** Discount → form defaults (numerics converted to strings). */
function toDefaults(d?: Discount): DiscountFormValues {
  if (!d) {
    return {
      code: "",
      name: "",
      description: "",
      type: "percentage",
      value: "10",
      scope: "global",
      categoryId: "",
      minCartValue: "",
      minQuantity: "",
      buyQuantity: "",
      getQuantity: "",
      maxDiscountAmount: "",
      usageLimitTotal: "",
      usageLimitPerUser: "1",
      isStackable: false,
      isActive: true,
      isFlashSale: false,
      startDate: isoDate(),
      endDate: isoDate(30),
    };
  }
  return {
    code: d.code ?? "",
    name: d.name,
    description: d.description ?? "",
    type: d.type,
    value: String(d.value),
    scope: d.scope === "category" ? "category" : "global",
    categoryId: d.categoryId ?? "",
    minCartValue: d.minCartValue?.toString() ?? "",
    minQuantity: d.minQuantity?.toString() ?? "",
    buyQuantity: d.buyQuantity?.toString() ?? "",
    getQuantity: d.getQuantity?.toString() ?? "",
    maxDiscountAmount: d.maxDiscountAmount?.toString() ?? "",
    usageLimitTotal: d.usageLimitTotal?.toString() ?? "",
    usageLimitPerUser: d.usageLimitPerUser.toString(),
    isStackable: d.isStackable,
    isActive: d.isActive,
    isFlashSale: d.isFlashSale,
    startDate: d.startDate.split("T")[0],
    endDate: d.endDate.split("T")[0],
  };
}

/** Convert form values into the backend payload (string→number/ISO). */
function toPayload(v: DiscountFormValues) {
  return {
    code: v.code.trim() ? v.code.trim().toUpperCase() : null,
    name: v.name,
    description: v.description || undefined,
    type: v.type,
    value: parseFloat(v.value) || 0,
    scope: v.scope,
    categoryId: v.scope === "category" ? v.categoryId : undefined,
    minCartValue: v.minCartValue ? parseFloat(v.minCartValue) : undefined,
    minQuantity: v.minQuantity ? parseInt(v.minQuantity) : undefined,
    buyQuantity: v.buyQuantity ? parseInt(v.buyQuantity) : undefined,
    getQuantity: v.getQuantity ? parseInt(v.getQuantity) : undefined,
    maxDiscountAmount: v.maxDiscountAmount
      ? parseFloat(v.maxDiscountAmount)
      : undefined,
    usageLimitTotal: v.usageLimitTotal
      ? parseInt(v.usageLimitTotal)
      : undefined,
    usageLimitPerUser: parseInt(v.usageLimitPerUser) || 1,
    isStackable: v.isStackable,
    priority: 0,
    isActive: v.isActive,
    isFlashSale: v.isFlashSale,
    startDate: new Date(v.startDate).toISOString(),
    endDate: new Date(v.endDate + "T23:59:59").toISOString(),
  };
}

/** Create/edit discount. Mount with `key={discount?.id ?? 'new'}` so defaults seed fresh. */
export function DiscountFormModal({
  open,
  onClose,
  discount,
}: {
  open: boolean;
  onClose: () => void;
  discount?: Discount;
}) {
  const t = useTranslations();
  const isEdit = Boolean(discount);
  const form = useZodForm(discountSchema(t), {
    defaultValues: toDefaults(discount),
  });
  const { data: categories = [] } = useCategories();

  const type = form.watch("type");
  const scope = form.watch("scope");

  const save = useAdminMutation(
    (v: DiscountFormValues) =>
      isEdit
        ? adminApi.patch(`/admin/discounts/${discount!.id}`, toPayload(v))
        : adminApi.post("/admin/discounts", toPayload(v)),
    {
      invalidates: ["discounts"],
      successMessage: isEdit
        ? t("admin.marketing.discounts.updated")
        : t("admin.marketing.discounts.created"),
      errorMessage: t("admin.marketing.discounts.saveFailed"),
      onSuccess: onClose,
    },
  );

  const categoryOptions = [
    { value: "", label: t("admin.marketing.discounts.selectCategory") },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={
        isEdit
          ? t("admin.marketing.discounts.edit")
          : t("admin.marketing.discounts.new")
      }
      form={form}
      onSubmit={(v) => save.mutate(v)}
      isSubmitting={save.isPending}
      submitLabel={isEdit ? t("common.update") : t("common.create")}
      maxWidth="max-w-2xl"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormInput
          name="name"
          label={t("admin.marketing.discounts.name")}
          placeholder={t("admin.marketing.discounts.namePlaceholder")}
        />
        <FormInput
          name="code"
          label={t("admin.marketing.discounts.couponCodeOptional")}
          placeholder={t("admin.marketing.discounts.codePlaceholder")}
          className="font-mono uppercase"
          helperText={t("admin.marketing.discounts.codeHelper")}
        />
      </div>

      <FormTextarea
        name="description"
        label={t("common.description")}
        rows={2}
        placeholder={t("admin.marketing.discounts.descriptionPlaceholder")}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormSelect
          name="type"
          label={t("admin.marketing.discounts.typeLabel")}
          options={discountTypeOptions(t)}
        />
        <FormInput
          name="value"
          type="number"
          min="0"
          max={type === "percentage" || type === "bogo" ? 100 : 10000}
          step={type === "percentage" || type === "bogo" ? 1 : 0.01}
          label={
            type === "bogo"
              ? t("admin.marketing.discounts.bogoRate")
              : t("admin.marketing.discounts.value")
          }
          placeholder={
            type === "bogo"
              ? t("admin.marketing.discounts.freePlaceholder")
              : ""
          }
          helperText={
            type === "bogo"
              ? t("admin.marketing.discounts.bogoHelper")
              : undefined
          }
        />
      </div>

      {type === "bogo" && (
        <div className="grid grid-cols-1 gap-4 rounded-lg border border-border bg-surface/60 p-4 sm:grid-cols-2">
          <p className="text-sm font-medium text-primary sm:col-span-2">
            {t("admin.marketing.discounts.bogoSettings")}
          </p>
          <FormInput
            name="buyQuantity"
            type="number"
            min="1"
            label={t("admin.marketing.discounts.buyQuantity")}
            placeholder={t("admin.marketing.discounts.oneExample")}
          />
          <FormInput
            name="getQuantity"
            type="number"
            min="1"
            label={t("admin.marketing.discounts.getQuantity")}
            placeholder={t("admin.marketing.discounts.oneExample")}
          />
        </div>
      )}

      {type === "bulk_quantity" && (
        <div className="rounded-lg border border-border bg-surface/60 p-4">
          <p className="mb-2 text-sm font-medium text-primary">
            {t("admin.marketing.discounts.bulkSettings")}
          </p>
          <FormInput
            name="minQuantity"
            type="number"
            min="2"
            label={t("admin.marketing.discounts.minQuantity")}
            placeholder={t("admin.marketing.discounts.minQuantityPlaceholder")}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormSelect
          name="scope"
          label={t("admin.marketing.discounts.scopeLabel")}
          options={scopeFormOptions(t)}
        />
        {scope === "category" && (
          <FormSelect
            name="categoryId"
            label={t("common.category")}
            options={categoryOptions}
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormInput
          name="minCartValue"
          type="number"
          min="0"
          step="0.01"
          label={t("admin.marketing.discounts.minCartValue")}
          placeholder={t("admin.marketing.discounts.hundredExample")}
        />
        <FormInput
          name="maxDiscountAmount"
          type="number"
          min="0"
          step="0.01"
          label={t("admin.marketing.discounts.maxDiscountAmount")}
          placeholder={t("admin.marketing.discounts.fiveHundredExample")}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormInput
          name="usageLimitTotal"
          type="number"
          min="1"
          label={t("admin.marketing.discounts.totalUsageLimit")}
          placeholder={t("admin.marketing.discounts.unlimited")}
        />
        <FormInput
          name="usageLimitPerUser"
          type="number"
          min="1"
          label={t("admin.marketing.discounts.perUserLimit")}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormDatePicker
          name="startDate"
          label={t("admin.marketing.discounts.startDate")}
        />
        <FormDatePicker
          name="endDate"
          label={t("admin.marketing.discounts.endDate")}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-2">
        <FormCheckbox
          name="isFlashSale"
          label={t("admin.marketing.discounts.flashSale")}
        />
        <FormCheckbox
          name="isStackable"
          label={t("admin.marketing.discounts.stackable")}
        />
        <FormCheckbox name="isActive" label={t("common.active")} />
      </div>
    </FormModal>
  );
}

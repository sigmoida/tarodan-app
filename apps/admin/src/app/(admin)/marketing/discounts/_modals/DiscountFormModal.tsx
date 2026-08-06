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
    // Motorda karşılığı olmayan eski tipler (bogo / bulk_quantity) zaten sabit
    // tutar gibi işleniyordu; form onları o türe indirir ki kayıt açılabilsin.
    type: d.type === "percentage" ? "percentage" : "fixed_amount",
    value: String(d.value),
    scope: d.scope === "category" ? "category" : "global",
    categoryId: d.categoryId ?? "",
    minCartValue: d.minCartValue?.toString() ?? "",
    maxDiscountAmount: d.maxDiscountAmount?.toString() ?? "",
    usageLimitTotal: d.usageLimitTotal?.toString() ?? "",
    // null = sınırsız; formda 0 ile temsil edilir.
    usageLimitPerUser: (d.usageLimitPerUser ?? 0).toString(),
    isStackable: d.isStackable,
    isActive: d.isActive,
    isFlashSale: d.isFlashSale,
    startDate: d.startDate.split("T")[0],
    endDate: d.endDate.split("T")[0],
  };
}

/** Convert form values into the backend payload (string→number/ISO). */
function toPayload(v: DiscountFormValues, isCoupon: boolean) {
  return {
    code: v.code.trim() ? v.code.trim().toUpperCase() : null,
    name: v.name,
    description: v.description || undefined,
    type: v.type,
    value: parseFloat(v.value) || 0,
    scope: v.scope,
    categoryId: v.scope === "category" ? v.categoryId : undefined,
    minCartValue: v.minCartValue ? parseFloat(v.minCartValue) : undefined,
    maxDiscountAmount: v.maxDiscountAmount
      ? parseFloat(v.maxDiscountAmount)
      : undefined,
    // Kullanım limitleri yalnız KUPONDA anlamlıdır (kodsuz kampanyada sayaç
    // tutulmaz); kampanyada alan gösterilmez ve gönderilmez.
    usageLimitTotal:
      isCoupon && v.usageLimitTotal ? parseInt(v.usageLimitTotal) : undefined,
    // 0 = sınırsız (misafirin de kullanabilmesi için).
    usageLimitPerUser: isCoupon ? parseInt(v.usageLimitPerUser) || 0 : 0,
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
  // Kod girildiyse KUPON, girilmediyse otomatik kampanyadır. İkisi farklı
  // alanlara sahiptir; kupon kotası kampanyada tutulmaz.
  const isCoupon = Boolean(form.watch("code")?.trim());

  const save = useAdminMutation(
    (v: DiscountFormValues) =>
      isEdit
        ? adminApi.patch(
            `/admin/discounts/${discount!.id}`,
            toPayload(v, isCoupon),
          )
        : adminApi.post("/admin/discounts", toPayload(v, isCoupon)),
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
      size="2xl"
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
          max={type === "percentage" ? 100 : 10000}
          step={type === "percentage" ? 1 : 0.01}
          label={t("admin.marketing.discounts.value")}
          placeholder={type === "percentage" ? "10" : "100"}
        />
      </div>

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

      {/* Kullanım limitleri yalnız KUPONDA anlamlı: kodsuz kampanyada motor
          sayaç tutmaz, alanlar doldurulsa da hiçbir şey yapmazdı. */}
      {isCoupon && (
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
            min="0"
            label={t("admin.marketing.discounts.perUserLimit")}
            placeholder="1"
            helperText={t("admin.marketing.discounts.perUserLimitHelper")}
          />
        </div>
      )}

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

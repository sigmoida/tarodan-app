"use client";

import { useEffect, useRef } from "react";
import {
  FormModal,
  FormInput,
  FormDatePicker,
  FormSelect,
  FormTextarea,
  FormCheckbox,
  FormSearchableMultiSelect,
  useZodForm,
} from "@tarodan/ui/form";
import { adminApi } from "@/lib/api";
import { useUserOptions, userOptionLabel } from "../_hooks/useUserOptions";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { useCategories } from "@/hooks/useCategories";
import { discountSchema, type DiscountFormValues } from "../_lib/schema";
import {
  audienceFormOptions,
  discountTypeOptions,
  membershipTierOptions,
  scopeFormOptions,
  targetFormOptions,
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
      target: "buyer_commission",
      audience: "everyone",
      targetTierTypes: [],
      targetUserIds: [],
      budgetLimit: "",
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
    // Ürün fiyatı kampanyaları satıcıya aittir ve bu formdan düzenlenmez;
    // eski bir kayıt açılırsa varsayılan bedel kalemine düşer.
    target:
      d.target && d.target !== "product_price" ? d.target : "buyer_commission",
    audience: d.audience ?? "everyone",
    targetTierTypes: (d.targetTierTypes ?? []).map((value) => ({
      value,
      label: value,
    })),
    // Sunucu hedeflenen kişileri adlarıyla döndürür; yalnız kimlik geldiğinde
    // (eski yanıt) çip kimliği gösterir — seçim yine de KAYBOLMAZ, ki düzenleme
    // kaydı kitleyi sıfırlamasın.
    targetUserIds: (d.targetUsers?.length
      ? d.targetUsers.map((u) => ({
          value: u.id,
          label: userOptionLabel(u),
        }))
      : (d.targetUserIds ?? []).map((id) => ({
          value: id,
          label: id,
        }))) as Array<{
      value: string;
      label: string;
    }>,
    budgetLimit: d.budgetLimit?.toString() ?? "",
    minCartValue: d.minCartValue?.toString() ?? "",
    minQuantity: d.minQuantity?.toString() ?? "",
    buyQuantity: d.buyQuantity?.toString() ?? "",
    getQuantity: d.getQuantity?.toString() ?? "",
    maxDiscountAmount: d.maxDiscountAmount?.toString() ?? "",
    usageLimitTotal: d.usageLimitTotal?.toString() ?? "",
    // null = limitsiz; formda 0 olarak temsil edilir (API sözleşmesi: 0 = limitsiz).
    usageLimitPerUser: (d.usageLimitPerUser ?? 0).toString(),
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
    // 0 = kişi-başı limitsiz (yalnız 'herkes' kitlesinde; misafirler ancak
    // limitsiz kodu kullanabilir). Boş bırakılırsa varsayılan 1.
    usageLimitPerUser:
      v.usageLimitPerUser.trim() === ""
        ? 1
        : parseInt(v.usageLimitPerUser) || 0,
    isStackable: v.isStackable,
    priority: 0,
    isActive: v.isActive,
    isFlashSale: v.isFlashSale,
    startDate: new Date(v.startDate).toISOString(),
    endDate: new Date(v.endDate + "T23:59:59").toISOString(),
    target: v.target,
    audience: v.audience,
    targetTierTypes:
      v.audience === "membership_tiers"
        ? v.targetTierTypes.map((option) => option.value)
        : [],
    targetUserIds:
      v.audience === "specific_buyers" || v.audience === "specific_sellers"
        ? v.targetUserIds.map((option) => option.value)
        : [],
    budgetLimit: v.budgetLimit ? parseFloat(v.budgetLimit) : undefined,
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
  const audience = form.watch("audience");
  // Liste yalnız kitle "belirli kişiler" iken çekilir; diğer kitlelerde alan
  // hiç görünmediği için istek de atılmaz.
  const userOptions = useUserOptions(
    audience === "specific_sellers" ? "sellers" : "buyers",
    audience === "specific_buyers" || audience === "specific_sellers",
  );

  /**
   * Kitle TARAFI değişince seçilenler sıfırlanır.
   *
   * Alıcı seçip sonra "belirli satıcılar"a geçildiğinde seçenek kaynağı
   * satıcılara dönüyor ama çipler duruyordu: kampanya alıcı kimlikleriyle
   * "belirli satıcılar" olarak kaydediliyor ve hiçbir zaman uygulanmıyordu —
   * ne şema ne sunucu kimliklerin gerçekten satıcı olduğunu doğruluyor.
   */
  const audienceSideRef = useRef(audience);
  useEffect(() => {
    if (audienceSideRef.current === audience) return;
    const wasSpecific =
      audienceSideRef.current === "specific_buyers" ||
      audienceSideRef.current === "specific_sellers";
    const isSpecific =
      audience === "specific_buyers" || audience === "specific_sellers";
    if (wasSpecific && isSpecific) form.setValue("targetUserIds", []);
    audienceSideRef.current = audience;
  }, [audience, form]);

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

      {/* Cep kuralı: platform yalnız kendi bedellerini indirebilir. Ürün fiyatı
          satıcının malıdır ve bu formda seçenek olarak bile yer almaz. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormSelect
          name="target"
          label={t("admin.marketing.discounts.targetLabel")}
          options={targetFormOptions(t)}
          helperText={t("admin.marketing.discounts.targetHelper")}
        />
        <FormInput
          name="budgetLimit"
          type="number"
          min="0"
          step="0.01"
          label={t("admin.marketing.discounts.budgetLimit")}
          helperText={t("admin.marketing.discounts.budgetHelper")}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormSelect
          name="audience"
          label={t("admin.marketing.discounts.audienceLabel")}
          options={audienceFormOptions(t)}
          helperText={t("admin.marketing.discounts.audienceHelper")}
        />
        {audience === "membership_tiers" && (
          <FormSearchableMultiSelect
            name="targetTierTypes"
            label={t("admin.marketing.discounts.targetTiers")}
            options={membershipTierOptions(t)}
          />
        )}
        {(audience === "specific_buyers" ||
          audience === "specific_sellers") && (
          <FormSearchableMultiSelect
            name="targetUserIds"
            label={t("admin.marketing.discounts.targetUsers")}
            helperText={t("admin.marketing.discounts.targetUsersHelper")}
            searchPlaceholder={t("admin.marketing.discounts.searchUser")}
            placeholder={t("admin.marketing.discounts.selectUsers")}
            loadingText={t("common.loading")}
            emptyText={
              userOptions.failed
                ? t("admin.marketing.discounts.userSearchFailed")
                : t("admin.marketing.discounts.noUserFound")
            }
            {...userOptions}
          />
        )}
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
              : type === "percentage"
                ? "10"
                : "100"
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
          min="0"
          label={t("admin.marketing.discounts.perUserLimit")}
          placeholder={t("admin.marketing.discounts.perUserLimitPlaceholder")}
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

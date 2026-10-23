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
import { Panel } from "@/components/detail/Panel";
import { SectionTitle } from "@/components/detail/SectionTitle";
import { useUserOptions } from "../_hooks/useUserOptions";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { useCategories } from "@/hooks/useCategories";
import { discountSchema, type DiscountFormValues } from "../_lib/schema";
import { discountFormToPayload, discountToForm } from "../_lib/form";
import {
  audienceFormOptions,
  discountTypeOptions,
  membershipTierOptions,
  scopeFormOptions,
  targetFormOptions,
  type Discount,
} from "../_lib/types";
import { useTranslations } from "next-intl";

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
    defaultValues: discountToForm(discount),
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
        ? adminApi.patch(
            `/admin/discounts/${discount!.id}`,
            discountFormToPayload(v),
          )
        : adminApi.post("/admin/discounts", discountFormToPayload(v)),
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
        {/* Amounts are text, not type="number" (see `@/lib/schemas/amount`). */}
        <FormInput
          name="budgetLimit"
          type="text"
          inputMode="decimal"
          autoComplete="off"
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
          type="text"
          inputMode="decimal"
          autoComplete="off"
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
        <Panel className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SectionTitle as="h4" size="sm" className="sm:col-span-2">
            {t("admin.marketing.discounts.bogoSettings")}
          </SectionTitle>
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
        </Panel>
      )}

      {type === "bulk_quantity" && (
        <Panel>
          <SectionTitle as="h4" size="sm" className="mb-2">
            {t("admin.marketing.discounts.bulkSettings")}
          </SectionTitle>
          <FormInput
            name="minQuantity"
            type="number"
            min="2"
            label={t("admin.marketing.discounts.minQuantity")}
            placeholder={t("admin.marketing.discounts.minQuantityPlaceholder")}
          />
        </Panel>
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
          type="text"
          inputMode="decimal"
          autoComplete="off"
          label={t("admin.marketing.discounts.minCartValue")}
          placeholder={t("admin.marketing.discounts.hundredExample")}
        />
        <FormInput
          name="maxDiscountAmount"
          type="text"
          inputMode="decimal"
          autoComplete="off"
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

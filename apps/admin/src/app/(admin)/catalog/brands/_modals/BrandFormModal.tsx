"use client";

import {
  FormModal,
  FormInput,
  FormTextarea,
  FormCheckbox,
  useZodForm,
} from "@tarodan/ui/form";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { brandSchema, type BrandFormValues } from "../_lib/schema";
import type { Brand } from "../_lib/types";

export function BrandFormModal({
  open,
  onClose,
  brand,
}: {
  open: boolean;
  onClose: () => void;
  brand?: Brand;
}) {
  const t = useTranslations();
  const isEdit = Boolean(brand);
  const form = useZodForm(brandSchema(t), {
    defaultValues: brand
      ? {
          name: brand.name,
          logo: brand.logo ?? "",
          website: brand.website ?? "",
          description: brand.description ?? "",
          country: brand.country ?? "",
          foundedYear:
            brand.foundedYear != null ? String(brand.foundedYear) : "",
          sortOrder: brand.sortOrder != null ? String(brand.sortOrder) : "0",
          isActive: brand.isActive,
        }
      : {
          name: "",
          logo: "",
          website: "",
          description: "",
          country: "",
          foundedYear: "",
          sortOrder: "0",
          isActive: true,
        },
  });

  const save = useAdminMutation(
    (v: BrandFormValues) => {
      const payload = {
        name: v.name,
        logo: v.logo || null,
        website: v.website || null,
        description: v.description || null,
        country: v.country || null,
        foundedYear: v.foundedYear ? parseInt(v.foundedYear, 10) : null,
        sortOrder: v.sortOrder ? parseInt(v.sortOrder, 10) : 0,
        isActive: v.isActive,
      };
      return isEdit
        ? adminApi.updateBrand(brand!.id, payload)
        : adminApi.createBrand(payload);
    },
    {
      invalidates: ["brands"],
      successMessage: isEdit
        ? t("admin.catalog.brands.updated")
        : t("admin.catalog.brands.created"),
      onSuccess: onClose,
    },
  );

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={
        isEdit
          ? t("admin.catalog.brands.editTitle")
          : t("admin.catalog.brands.new")
      }
      form={form}
      onSubmit={(v) => save.mutate(v)}
      isSubmitting={save.isPending}
      submitLabel={isEdit ? t("common.update") : t("common.add")}
    >
      <FormInput
        name="name"
        label={t("admin.catalog.brands.nameLabel")}
        placeholder={t("admin.catalog.brands.namePlaceholder")}
      />
      <FormInput
        name="logo"
        label={t("admin.catalog.brands.logoUrl")}
        type="url"
        placeholder="https://example.com/logo.png"
      />
      <FormInput
        name="website"
        label={t("admin.catalog.brands.website")}
        type="url"
        placeholder="https://www.ferrari.com"
      />
      <FormTextarea
        name="description"
        label={t("common.description")}
        rows={3}
        placeholder={t("admin.catalog.brands.descriptionPlaceholder")}
      />
      <div className="flex gap-4">
        <div className="flex-1">
          <FormInput
            name="country"
            label={t("admin.catalog.common.country")}
            placeholder={t("admin.catalog.brands.countryPlaceholder")}
          />
        </div>
        <div className="flex-1">
          <FormInput
            name="foundedYear"
            label={t("admin.catalog.common.foundedYear")}
            type="number"
            placeholder={t("admin.catalog.brands.foundedYearPlaceholder")}
          />
        </div>
      </div>
      <FormInput
        name="sortOrder"
        label={t("admin.catalog.common.sortOrder")}
        type="number"
        placeholder="0"
      />
      <FormCheckbox name="isActive" label={t("common.active")} />
    </FormModal>
  );
}

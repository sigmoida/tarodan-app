"use client";

import {
  FormModal,
  FormInput,
  FormTextarea,
  FormCheckbox,
  FormImageUpload,
  useZodForm,
} from "@tarodan/ui/form";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import {
  manufacturerSchema,
  type ManufacturerFormValues,
} from "../_lib/schema";
import type { Manufacturer } from "../_lib/types";

export function ManufacturerFormModal({
  open,
  onClose,
  manufacturer,
}: {
  open: boolean;
  onClose: () => void;
  manufacturer?: Manufacturer;
}) {
  const t = useTranslations();
  const isEdit = Boolean(manufacturer);
  const form = useZodForm(manufacturerSchema(t), {
    defaultValues: manufacturer
      ? {
          name: manufacturer.name,
          logo: manufacturer.logo ?? "",
          website: manufacturer.website ?? "",
          country: manufacturer.country ?? "",
          foundedYear:
            manufacturer.foundedYear != null
              ? String(manufacturer.foundedYear)
              : "",
          description: manufacturer.description ?? "",
          isActive: manufacturer.isActive,
        }
      : {
          name: "",
          logo: "",
          website: "",
          country: "",
          foundedYear: "",
          description: "",
          isActive: true,
        },
  });

  const save = useAdminMutation(
    (v: ManufacturerFormValues) => {
      const payload = {
        name: v.name,
        logo: v.logo || null,
        website: v.website || null,
        country: v.country || null,
        foundedYear: v.foundedYear ? parseInt(v.foundedYear, 10) : null,
        description: v.description || null,
        isActive: v.isActive,
      };
      return isEdit
        ? adminApi.updateManufacturer(manufacturer!.id, payload)
        : adminApi.createManufacturer(payload);
    },
    {
      invalidates: ["manufacturers"],
      successMessage: isEdit
        ? t("admin.catalog.manufacturers.updated")
        : t("admin.catalog.manufacturers.created"),
      onSuccess: onClose,
    },
  );

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={
        isEdit
          ? t("admin.catalog.manufacturers.editTitle")
          : t("admin.catalog.manufacturers.new")
      }
      form={form}
      onSubmit={(v) => save.mutate(v)}
      isSubmitting={save.isPending}
      submitLabel={isEdit ? t("common.update") : t("common.add")}
    >
      <FormInput
        name="name"
        label={t("admin.catalog.manufacturers.nameLabel")}
        placeholder={t("admin.catalog.manufacturers.namePlaceholder")}
      />
      <FormImageUpload
        name="logo"
        label={t("admin.catalog.common.logo")}
        upload={(file) => adminApi.uploadMedia(file).then((r) => r.data.url)}
      />
      <FormInput
        name="website"
        label={t("admin.catalog.common.website")}
        type="url"
        placeholder="https://www.hotwheels.com"
      />
      <div className="flex gap-4">
        <div className="flex-1">
          <FormInput
            name="country"
            label={t("admin.catalog.common.country")}
            placeholder={t("admin.catalog.manufacturers.countryPlaceholder")}
          />
        </div>
        <div className="flex-1">
          <FormInput
            name="foundedYear"
            label={t("admin.catalog.common.foundedYear")}
            type="number"
            placeholder={t(
              "admin.catalog.manufacturers.foundedYearPlaceholder",
            )}
          />
        </div>
      </div>
      <FormTextarea
        name="description"
        label={t("common.description")}
        rows={2}
        placeholder={t("admin.catalog.manufacturers.descriptionPlaceholder")}
      />
      <FormCheckbox name="isActive" label={t("common.active")} />
    </FormModal>
  );
}

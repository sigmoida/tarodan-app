"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  FormModal,
  FormInput,
  FormSelect,
  FormCheckbox,
  useZodForm,
} from "@tarodan/ui/form";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { carModelSchema, type CarModelFormValues } from "../_lib/schema";
import type { Brand, CarModel } from "../_lib/types";

/**
 * Shared create/edit car-model modal — used by both /catalog/car-models and the
 * /catalog/brands expand panel. Brand is locked on edit; `defaultBrandId` +
 * `lockBrand` preselect/lock it when opened from a specific brand.
 */
export function CarModelFormModal({
  open,
  onClose,
  model,
  defaultBrandId,
  lockBrand,
}: {
  open: boolean;
  onClose: () => void;
  model?: CarModel;
  defaultBrandId?: string;
  lockBrand?: boolean;
}) {
  const t = useTranslations();
  const isEdit = Boolean(model);

  const { data: brands = [] } = useQuery<Brand[]>({
    queryKey: adminKeys.options("brands"),
    queryFn: async () =>
      (await adminApi.getBrands({ limit: 100 })).data?.data ?? [],
  });

  const form = useZodForm(carModelSchema(t), {
    defaultValues: model
      ? {
          brandId: model.brandId,
          name: model.name,
          yearStart: model.yearStart != null ? String(model.yearStart) : "",
          yearEnd: model.yearEnd != null ? String(model.yearEnd) : "",
          isActive: model.isActive,
        }
      : {
          brandId: defaultBrandId ?? "",
          name: "",
          yearStart: "",
          yearEnd: "",
          isActive: true,
        },
  });

  const save = useAdminMutation(
    (v: CarModelFormValues) => {
      const payload = {
        name: v.name,
        yearStart: v.yearStart ? Number(v.yearStart) : undefined,
        yearEnd: v.yearEnd ? Number(v.yearEnd) : undefined,
        isActive: v.isActive,
      };
      return isEdit
        ? adminApi.updateCarModel(model!.id, payload)
        : adminApi.createCarModel({ ...payload, brandId: v.brandId });
    },
    {
      invalidates: ["car-models", "brands"],
      successMessage: isEdit
        ? t("admin.catalog.carModels.updated")
        : t("admin.catalog.carModels.created"),
      onSuccess: onClose,
    },
  );

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={
        isEdit
          ? t("admin.catalog.carModels.editTitle")
          : t("admin.catalog.carModels.new")
      }
      form={form}
      onSubmit={(v) => save.mutate(v)}
      isSubmitting={save.isPending}
      submitLabel={isEdit ? t("common.update") : t("common.add")}
    >
      <FormSelect
        name="brandId"
        label={t("admin.catalog.common.brand")}
        placeholder={t("admin.catalog.common.selectPlaceholder")}
        options={brands.map((b) => ({ value: b.id, label: b.name }))}
        disabled={isEdit || lockBrand}
      />
      <FormInput
        name="name"
        label={t("admin.catalog.carModels.nameLabel")}
        placeholder={t("admin.catalog.carModels.namePlaceholder")}
      />
      <div className="flex gap-4">
        <div className="flex-1">
          <FormInput
            name="yearStart"
            label={t("admin.catalog.carModels.yearStart")}
            type="number"
            placeholder="2014"
          />
        </div>
        <div className="flex-1">
          <FormInput
            name="yearEnd"
            label={t("admin.catalog.carModels.yearEnd")}
            type="number"
            placeholder={t("admin.catalog.carModels.yearEndPlaceholder")}
          />
        </div>
      </div>
      <FormCheckbox name="isActive" label={t("common.active")} />
    </FormModal>
  );
}

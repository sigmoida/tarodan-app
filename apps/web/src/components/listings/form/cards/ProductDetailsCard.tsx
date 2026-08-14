/** @format */

"use client";

import { useTranslations } from "next-intl";
import { Controller, useFormContext } from "react-hook-form";
import { Select } from "@tarodan/ui";
import { FormInput, FormSelect } from "@tarodan/ui/form";
import { SectionCard } from "@/components/ui";
import {
  FALLBACK_MATERIALS,
  FALLBACK_SCALES,
  type Brand,
  type CarModel,
  type Category,
  type Ref,
} from "../constants";

interface ProductDetailsCardProps {
  locale: string;
  conditions: Array<{ value: string; label: string }>;
  flatCategories: Category[];
  brands: Brand[];
  brandsLoading: boolean;
  models: CarModel[];
  modelsLoading: boolean;
  scaleList: string[];
  materialList: Array<{ slug: string; label: string }>;
  manufacturerList: Ref[];
  yearOptions: number[];
}

/** "Ürün Detayları" — the category/condition + brand/model/scale/material/
 *  manufacturer/year selects. Brand uses a Controller so changing it clears the
 *  model. Shared by new & edit forms. */
export default function ProductDetailsCard({
  conditions,
  flatCategories,
  brands,
  brandsLoading,
  models,
  modelsLoading,
  scaleList,
  materialList,
  manufacturerList,
  yearOptions,
}: ProductDetailsCardProps) {
  const { setValue, watch } = useFormContext();
  const brandId = watch("brandId");
  const t = useTranslations();

  const scales = scaleList.length > 0 ? scaleList : FALLBACK_SCALES;
  const materials = materialList.length > 0 ? materialList : FALLBACK_MATERIALS;

  return (
    <SectionCard title={t("product.productDetails")}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormSelect
          name="categoryId"
          label={t("product.categoryRequired")}
          placeholder={t("product.selectCategory")}
          options={flatCategories.map((cat) => ({
            value: cat.id,
            label: cat.name,
          }))}
        />
        <FormSelect
          name="condition"
          label={t("product.conditionRequired")}
          placeholder={t("product.selectCondition")}
          options={conditions.map((c) => ({ value: c.value, label: c.label }))}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <Controller
          name="brandId"
          render={({ field }) => (
            <Select
              label={t("product.brandRequired")}
              value={field.value == null ? "" : String(field.value)}
              onChange={(e) => {
                field.onChange(e.target.value);
                setValue("carModelId", "");
              }}
              options={brands.map((b) => ({ value: b.id, label: b.name }))}
              placeholder={
                brandsLoading ? t("common.loading") : t("product.selectBrand")
              }
              disabled={brandsLoading}
            />
          )}
        />

        <FormSelect
          name="carModelId"
          label={t("product.model")}
          options={models.map((m) => ({ value: m.id, label: m.name }))}
          placeholder={
            !brandId
              ? t("product.selectBrandFirst")
              : modelsLoading
                ? t("common.loading")
                : models.length === 0
                  ? t("product.noModelsForBrand")
                  : t("product.selectModel")
          }
          disabled={!brandId || modelsLoading}
        />

        <FormInput
          name="modelCode"
          label={t("product.modelCode")}
          placeholder={t("product.modelCodePlaceholder")}
          maxLength={100}
        />

        <FormInput
          name="color"
          label={t("product.colorRequired")}
          placeholder={t("product.colorPlaceholder")}
          maxLength={80}
        />

        <FormSelect
          name="scale"
          label={t("product.scaleRequired")}
          placeholder={t("product.selectScale")}
          options={scales.map((s) => ({ value: s, label: s }))}
        />

        <FormSelect
          name="material"
          label={t("product.materialRequired")}
          placeholder={t("product.selectMaterial")}
          options={materials.map((m) => ({ value: m.slug, label: m.label }))}
        />

        <FormSelect
          name="manufacturerId"
          label={t("product.manufacturerRequired")}
          placeholder={t("product.selectManufacturer")}
          options={manufacturerList.map((m) => ({
            value: m.id,
            label: m.name,
          }))}
        />

        <FormSelect
          name="isBoxed"
          label={t("product.boxedRequired")}
          placeholder={t("product.selectBoxedCondition")}
          options={[
            { value: "boxed", label: t("product.boxed") },
            { value: "unboxed", label: t("product.unboxed") },
          ]}
        />

        <FormSelect
          name="year"
          label={t("product.releaseYear")}
          placeholder={t("product.selectYear")}
          helperText={t("product.releaseYearHelper")}
          options={yearOptions.map((y) => ({
            value: String(y),
            label: String(y),
          }))}
        />
      </div>
    </SectionCard>
  );
}

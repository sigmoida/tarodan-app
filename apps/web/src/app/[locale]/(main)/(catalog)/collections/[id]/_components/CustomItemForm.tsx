/** @format */

"use client";

import { useMemo } from "react";
import { Controller } from "react-hook-form";
import { Button, Select } from "@tarodan/ui";
import {
  Form,
  FormInput,
  FormSelect,
  FormTextarea,
  FormImageUpload,
  useZodForm,
} from "@tarodan/ui/form";
import { useTranslations } from "next-intl";
import { collectionsApi, mediaApi } from "@/lib/api";
import { useWebMutation } from "@/hooks/useWebMutation";
import { useCollectionDetail } from "../_context/CollectionDetailContext";
import { useCollectionFilters } from "../_hooks/useCollectionFilters";
import { useCarModels } from "../_hooks/useCarModels";
import {
  customItemSchema,
  EMPTY_CUSTOM_ITEM,
  type CustomItemForm as CustomItemValues,
} from "../_lib/add-item";

/** Custom (non-listing) collection item — its own RHF+zod form + add mutation,
 *  the web modal recipe. Brand uses a Controller so changing it clears the model;
 *  the image goes through the shared FormImageUpload (uploads → URL). */
export default function CustomItemForm({ onClose }: { onClose: () => void }) {
  const t = useTranslations();
  const { collection, invalidateCollection } = useCollectionDetail();
  const filters = useCollectionFilters(true);

  const form = useZodForm(customItemSchema, {
    defaultValues: EMPTY_CUSTOM_ITEM,
  });
  const brand = form.watch("brand");
  const selectedBrandSlug = useMemo(
    () => filters.brands.find((b) => b.name === brand)?.slug,
    [filters.brands, brand],
  );
  const { models, isLoading: modelsLoading } = useCarModels(selectedBrandSlug);

  const add = useWebMutation(
    (values: CustomItemValues) =>
      collectionsApi.addItem(collection!.id, {
        customTitle: values.title.trim(),
        customDescription: values.description?.trim() || undefined,
        customBrand: values.brand?.trim() || undefined,
        customModel: values.model?.trim() || undefined,
        customYear: values.year ? Number(values.year) : undefined,
        customScale: values.scale || undefined,
        customManufacturer: values.manufacturer?.trim() || undefined,
        customMaterial: values.material || undefined,
        customImageUrl: values.imageUrl || undefined,
      }),
    {
      successMessage: t("collection.productsAddedToCollection"),
      errorMessage: t("collection.productsAddFailed"),
      onSuccess: async () => {
        await invalidateCollection();
        onClose();
      },
    },
  );

  if (!collection) return null;

  return (
    <Form
      form={form}
      onSubmit={(values) => add.mutate(values)}
      className="max-h-[60vh] space-y-3 overflow-y-auto"
    >
      <FormInput
        name="title"
        label={t("collection.customProductName")}
        placeholder={t("collection.customProductNamePlaceholder")}
      />
      <FormImageUpload
        name="imageUrl"
        label={t("collection.image")}
        upload={(file) =>
          mediaApi.uploadCollectionImage(file).then((res) => res.data.url)
        }
      />
      <FormTextarea
        name="description"
        label={t("product.description")}
        rows={2}
      />
      <div className="grid grid-cols-2 gap-3">
        <Controller
          name="brand"
          control={form.control}
          render={({ field }) => (
            <Select
              label={t("product.brand")}
              value={field.value || undefined}
              onChange={(e) => {
                field.onChange(e.target.value);
                form.setValue("model", "");
              }}
              placeholder={t("product.selectBrand")}
              options={filters.brands.map((b) => ({
                value: b.name,
                label: b.name,
              }))}
            />
          )}
        />
        <FormSelect
          name="model"
          label={t("product.model")}
          placeholder={
            !brand
              ? t("product.selectBrandFirst")
              : modelsLoading
                ? t("common.loading")
                : t("product.selectModel")
          }
          disabled={!brand || modelsLoading}
          options={models.map((m) => ({ value: m.name, label: m.name }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormInput
          name="year"
          type="number"
          label={t("product.releaseYear")}
          min={1900}
          max={2100}
        />
        <FormSelect
          name="scale"
          label={t("product.scale")}
          placeholder={t("product.selectScale")}
          options={filters.scales.map((s) => ({ value: s, label: s }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormSelect
          name="manufacturer"
          label={t("product.manufacturer")}
          placeholder={t("product.selectManufacturer")}
          options={filters.manufacturers.map((m) => ({
            value: m.name,
            label: m.name,
          }))}
        />
        <FormSelect
          name="material"
          label={t("product.material")}
          placeholder={t("product.selectMaterial")}
          options={filters.materials.map((m) => ({
            value: m.slug,
            label: m.label,
          }))}
        />
      </div>

      <div className="flex gap-3 border-t border-border pt-4">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="flex-1"
          onClick={onClose}
        >
          {t("common.cancel")}
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          className="flex-1"
          isLoading={add.isPending}
        >
          {t("common.add")}
        </Button>
      </div>
    </Form>
  );
}

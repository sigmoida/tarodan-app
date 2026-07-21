/** @format */

"use client";

import { TrashIcon } from "@heroicons/react/24/outline";
import type { UseFormReturn } from "react-hook-form";
import { Button } from "@tarodan/ui";
import {
  Form,
  FormInput,
  FormTextarea,
  FormSelect,
  FormCheckbox,
  FormImageUpload,
} from "@tarodan/ui/form";
import { useTranslations } from "next-intl";
import { SectionCard } from "@/components/ui";
import type { CollectionEditValues } from "../_lib/schema";

interface CollectionFormProps {
  form: UseFormReturn<CollectionEditValues>;
  onSubmit: (values: CollectionEditValues) => void;
  isSaving: boolean;
  uploadCover: (file: File) => Promise<string>;
  flatCategories: { id: string; name: string; slug: string }[];
  onCancel: () => void;
  onDelete: () => void;
}

export default function CollectionForm({
  form,
  onSubmit,
  isSaving,
  uploadCover,
  flatCategories,
  onCancel,
  onDelete,
}: CollectionFormProps) {
  const t = useTranslations();
  const name = form.watch("name") ?? "";
  const description = form.watch("description") ?? "";
  const isPublic = form.watch("isPublic");

  return (
    <SectionCard>
      <Form form={form} onSubmit={onSubmit} className="space-y-6">
        <FormInput
          name="name"
          label={t("collection.collectionNameLabel")}
          placeholder={t("collection.namePlaceholder")}
          maxLength={100}
          helperText={`${name.length}/100 ${t("collection.characters")}`}
        />
        <FormTextarea
          name="description"
          label={t("collection.descriptionLabel")}
          placeholder={t("collection.descriptionPlaceholder")}
          rows={5}
          maxLength={500}
          helperText={`${description.length}/500 ${t("collection.characters")}`}
        />
        <FormSelect
          name="categoryId"
          label={t("common.category")}
          placeholder={t("common.none")}
          options={flatCategories.map((c) => ({ value: c.id, label: c.name }))}
        />
        <div>
          <FormImageUpload
            name="coverImageUrl"
            label={t("collection.coverImage")}
            upload={uploadCover}
            accept="image/jpeg,image/png,image/webp"
            maxSizeMb={10}
          />
          <p className="mt-2 text-sm text-muted">
            {t("collection.coverImageHint")}
          </p>
        </div>
        <div>
          <FormCheckbox
            name="isPublic"
            label={t("collection.publicCollection")}
          />
          <p className="mt-2 text-sm text-muted">
            {isPublic
              ? t("collection.publicCollectionDesc")
              : t("collection.privateCollectionDesc")}
          </p>
        </div>

        <div className="flex flex-col gap-4 border-t border-border pt-4">
          <div className="flex gap-4">
            <Button
              type="button"
              variant="secondary"
              size="md"
              className="flex-1"
              onClick={onCancel}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              className="flex-1"
              isLoading={isSaving}
            >
              {t("collection.saveChanges")}
            </Button>
          </div>
          <Button
            type="button"
            variant="danger"
            size="md"
            className="flex items-center justify-center gap-2"
            onClick={onDelete}
          >
            <TrashIcon className="h-5 w-5" />
            {t("collection.deleteCollection")}
          </Button>
        </div>
      </Form>
    </SectionCard>
  );
}

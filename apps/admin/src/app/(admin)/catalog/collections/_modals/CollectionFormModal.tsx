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
import { collectionSchema, type CollectionFormValues } from "../_lib/schema";
import type { Collection } from "../_lib/types";

export function CollectionFormModal({
  open,
  onClose,
  collection,
}: {
  open: boolean;
  onClose: () => void;
  collection?: Collection;
}) {
  const t = useTranslations();
  const isEdit = Boolean(collection);
  const form = useZodForm(collectionSchema(t), {
    defaultValues: collection
      ? {
          name: collection.name,
          description: collection.description ?? "",
          coverImageUrl: collection.coverImageUrl ?? "",
          isPublic: collection.isPublic,
          isFeatured: collection.isFeatured,
        }
      : {
          name: "",
          description: "",
          coverImageUrl: "",
          isPublic: true,
          isFeatured: false,
        },
  });

  const save = useAdminMutation(
    (v: CollectionFormValues) =>
      isEdit
        ? adminApi.updateCollection(collection!.id, v)
        : adminApi.createCollection({
            name: v.name,
            description: v.description || undefined,
            coverImageUrl: v.coverImageUrl || undefined,
            isPublic: v.isPublic,
            isFeatured: v.isFeatured,
          }),
    {
      invalidates: ["collections"],
      successMessage: isEdit
        ? t("admin.catalog.collections.updated")
        : t("admin.catalog.collections.created"),
      onSuccess: onClose,
    },
  );

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={
        isEdit
          ? t("admin.catalog.collections.editTitle")
          : t("admin.catalog.collections.new")
      }
      form={form}
      onSubmit={(v) => save.mutate(v)}
      isSubmitting={save.isPending}
      submitLabel={isEdit ? t("common.update") : t("common.create")}
    >
      <FormInput name="name" label={t("admin.catalog.collections.nameLabel")} />
      <FormTextarea
        name="description"
        label={t("common.description")}
        rows={3}
      />
      <FormInput
        name="coverImageUrl"
        label={t("admin.catalog.collections.coverImageUrl")}
        type="url"
        placeholder="https://..."
      />
      <div className="flex items-center gap-6 pt-1">
        <FormCheckbox
          name="isPublic"
          label={t("admin.catalog.collections.visible")}
        />
        <FormCheckbox
          name="isFeatured"
          label={t("admin.catalog.collections.featured")}
        />
      </div>
    </FormModal>
  );
}

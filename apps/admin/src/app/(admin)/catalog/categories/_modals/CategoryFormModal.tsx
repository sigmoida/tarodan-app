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
import { categorySchema, type CategoryFormValues } from "../_lib/schema";
import type { Category } from "../_lib/types";

/** Create/edit category. Mount with `key={category?.id ?? 'new'}` so defaults seed fresh. */
export function CategoryFormModal({
  open,
  onClose,
  category,
}: {
  open: boolean;
  onClose: () => void;
  category?: Category;
}) {
  const t = useTranslations();
  const isEdit = Boolean(category);
  const form = useZodForm(categorySchema(t), {
    defaultValues: category
      ? {
          name: category.name,
          description: category.description ?? "",
          isActive: category.isActive,
        }
      : { name: "", description: "", isActive: true },
  });

  const save = useAdminMutation(
    (v: CategoryFormValues) =>
      isEdit
        ? adminApi.updateCategory(category!.id, { ...v, parentId: "" })
        : adminApi.createCategory({ ...v, parentId: "" }),
    {
      invalidates: ["categories"],
      successMessage: isEdit
        ? t("admin.catalog.categories.updated")
        : t("admin.catalog.categories.created"),
      onSuccess: onClose,
    },
  );

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={
        isEdit
          ? t("admin.catalog.categories.editTitle")
          : t("admin.catalog.categories.new")
      }
      form={form}
      onSubmit={(v) => save.mutate(v)}
      isSubmitting={save.isPending}
      submitLabel={isEdit ? t("common.update") : t("common.create")}
    >
      <FormInput name="name" label={t("admin.catalog.categories.nameLabel")} />
      <FormTextarea
        name="description"
        label={t("common.description")}
        rows={3}
      />
      <FormCheckbox name="isActive" label={t("common.active")} />
    </FormModal>
  );
}

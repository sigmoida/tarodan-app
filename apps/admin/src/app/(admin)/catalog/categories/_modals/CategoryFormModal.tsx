"use client";

import { useQuery } from "@tanstack/react-query";
import {
  FormModal,
  FormInput,
  FormSelect,
  FormTextarea,
  FormCheckbox,
  useZodForm,
} from "@tarodan/ui/form";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { categorySchema, type CategoryFormValues } from "../_lib/schema";
import type { Category } from "../_lib/types";

// Select can't carry an empty value ("" suppresses its placeholder), so the
// "no parent / root" choice is a sentinel that the payload maps back to "".
const NO_PARENT = "none";

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

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: adminKeys.options("categories"),
    queryFn: async () =>
      (await adminApi.getCategories({ limit: 100 })).data?.data ?? [],
  });

  // A category can't be its own parent, and the API rejects picking one of its
  // children (direct circular reference) — hide both from the options.
  const parentOptions = [
    { value: NO_PARENT, label: t("admin.catalog.categories.noParent") },
    ...categories
      .filter(
        (c) =>
          c.id !== category?.id &&
          !category?.children.some((child) => child.id === c.id),
      )
      .map((c) => ({ value: c.id, label: c.name })),
  ];

  const form = useZodForm(categorySchema(t), {
    defaultValues: category
      ? {
          name: category.name,
          description: category.description ?? "",
          parentId: category.parentId ?? NO_PARENT,
          sortOrder: String(category.sortOrder ?? 0),
          isActive: category.isActive,
        }
      : {
          name: "",
          description: "",
          parentId: NO_PARENT,
          sortOrder: "0",
          isActive: false,
        },
  });

  const save = useAdminMutation(
    (v: CategoryFormValues) => {
      const payload = {
        name: v.name,
        description: v.description,
        parentId: v.parentId && v.parentId !== NO_PARENT ? v.parentId : "",
        sortOrder: v.sortOrder ? parseInt(v.sortOrder, 10) : 0,
        isActive: v.isActive,
      };
      return isEdit
        ? adminApi.updateCategory(category!.id, payload)
        : adminApi.createCategory(payload);
    },
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
      <FormInput
        name="name"
        label={t("admin.catalog.categories.nameLabel")}
        placeholder={t("admin.catalog.categories.namePlaceholder")}
      />
      <FormSelect
        name="parentId"
        label={t("admin.catalog.categories.parentLabel")}
        placeholder={t("admin.catalog.common.selectPlaceholder")}
        options={parentOptions}
      />
      <FormTextarea
        name="description"
        label={t("common.description")}
        placeholder={t("admin.catalog.categories.descriptionPlaceholder")}
        rows={3}
      />
      <FormInput
        name="sortOrder"
        label={t("admin.catalog.common.sortOrder")}
        type="number"
      />
      <FormCheckbox
        name="isActive"
        label={t("common.active")}
        disabled={!isEdit}
      />
      {!isEdit && (
        <p className="text-sm text-muted">
          {t("admin.catalog.categories.commissionCoverageHint")}
        </p>
      )}
    </FormModal>
  );
}

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
import {
  attributeGroupSchema,
  type AttributeGroupFormValues,
} from "../_lib/schema";
import type { AttributeGroup } from "../_lib/types";

export function AttributeGroupFormModal({
  open,
  onClose,
  group,
}: {
  open: boolean;
  onClose: () => void;
  group?: AttributeGroup;
}) {
  const t = useTranslations();
  const isEdit = Boolean(group);
  const form = useZodForm(attributeGroupSchema(t), {
    defaultValues: group
      ? {
          name: group.name,
          description: group.description ?? "",
          sortOrder: String(group.sortOrder ?? 0),
          isRequired: group.isRequired,
          isActive: group.isActive,
        }
      : {
          name: "",
          description: "",
          sortOrder: "0",
          isRequired: false,
          isActive: true,
        },
  });

  const save = useAdminMutation(
    (v: AttributeGroupFormValues) => {
      const payload = {
        name: v.name,
        description: v.description || undefined,
        sortOrder: v.sortOrder ? parseInt(v.sortOrder, 10) : 0,
        isRequired: v.isRequired,
        isActive: v.isActive,
      };
      return isEdit
        ? adminApi.updateAttributeGroup(group!.id, payload)
        : adminApi.createAttributeGroup(payload);
    },
    {
      invalidates: ["attribute-groups"],
      successMessage: isEdit
        ? t("admin.catalog.attributes.groupUpdated")
        : t("admin.catalog.attributes.groupCreated"),
      onSuccess: onClose,
    },
  );

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={
        isEdit
          ? t("admin.catalog.attributes.editGroup")
          : t("admin.catalog.attributes.newGroup")
      }
      form={form}
      onSubmit={(v) => save.mutate(v)}
      isSubmitting={save.isPending}
      submitLabel={isEdit ? t("common.update") : t("common.create")}
    >
      <FormInput
        name="name"
        label={t("admin.catalog.attributes.nameField")}
        placeholder={t("admin.catalog.attributes.groupNamePlaceholder")}
      />
      <FormTextarea
        name="description"
        label={t("common.description")}
        placeholder={t("admin.catalog.attributes.descriptionPlaceholder")}
        rows={2}
      />
      <FormInput
        name="sortOrder"
        label={t("admin.catalog.common.sortOrder")}
        type="number"
        placeholder="0"
      />
      <div className="flex gap-6 pt-1">
        <FormCheckbox
          name="isRequired"
          label={t("admin.catalog.attributes.required")}
        />
        <FormCheckbox name="isActive" label={t("common.active")} />
      </div>
    </FormModal>
  );
}

"use client";

import {
  FormModal,
  FormInput,
  FormCheckbox,
  useZodForm,
} from "@tarodan/ui/form";
import { Button } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { attributeSchema, type AttributeFormValues } from "../_lib/schema";
import type { Attribute } from "../_lib/types";

export function AttributeFormModal({
  open,
  onClose,
  attribute,
  groupId,
}: {
  open: boolean;
  onClose: () => void;
  attribute?: Attribute;
  groupId: string;
}) {
  const t = useTranslations();
  const isEdit = Boolean(attribute);
  const form = useZodForm(attributeSchema(t), {
    defaultValues: attribute
      ? {
          value: attribute.value,
          displayValue: attribute.displayValue ?? "",
          color: attribute.color ?? "",
          sortOrder: String(attribute.sortOrder ?? 0),
          isActive: attribute.isActive,
        }
      : {
          value: "",
          displayValue: "",
          color: "",
          sortOrder: "0",
          isActive: true,
        },
  });
  const color = form.watch("color");

  const save = useAdminMutation(
    (v: AttributeFormValues) => {
      const payload = {
        value: v.value,
        displayValue: v.displayValue || undefined,
        // null = rengi temizle; undefined gönderilseydi mevcut hex kalırdı.
        color: v.color || null,
        sortOrder: v.sortOrder ? parseInt(v.sortOrder, 10) : 0,
        isActive: v.isActive,
      };
      return isEdit
        ? adminApi.updateAttribute(attribute!.id, payload)
        : adminApi.createAttribute({ ...payload, groupId });
    },
    {
      invalidates: ["attributes"],
      successMessage: isEdit
        ? t("admin.catalog.attributes.valueUpdated")
        : t("admin.catalog.attributes.valueCreated"),
      onSuccess: onClose,
    },
  );

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={
        isEdit
          ? t("admin.catalog.attributes.editValue")
          : t("admin.catalog.attributes.newValue")
      }
      form={form}
      onSubmit={(v) => save.mutate(v)}
      isSubmitting={save.isPending}
      submitLabel={isEdit ? t("common.update") : t("common.create")}
    >
      <FormInput
        name="value"
        label={t("admin.catalog.attributes.value")}
        placeholder={t("admin.catalog.attributes.valuePlaceholder")}
      />
      <FormInput
        name="displayValue"
        label={t("admin.catalog.attributes.displayValue")}
        placeholder={t("admin.catalog.attributes.displayValuePlaceholder")}
      />
      <div className="flex gap-4">
        {/* Renk her grupta girilebilir: global "Renk" grubu da swatch taşıyor,
            eskiden alan yalnız üreticiye özel gruplarda açıktı. */}
        <div>
          <FormInput
            name="color"
            label={t("admin.catalog.attributes.color")}
            type="color"
            className="h-10 w-14 p-1"
          />
          {color ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-1"
              onClick={() => form.setValue("color", "", { shouldDirty: true })}
            >
              {t("common.clear")}
            </Button>
          ) : null}
        </div>
        <div className="flex-1">
          <FormInput
            name="sortOrder"
            label={t("admin.catalog.common.sortOrder")}
            type="number"
            placeholder="0"
          />
        </div>
      </div>
      <FormCheckbox name="isActive" label={t("common.active")} />
    </FormModal>
  );
}

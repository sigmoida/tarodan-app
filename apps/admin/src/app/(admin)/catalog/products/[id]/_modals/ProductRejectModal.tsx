"use client";

import { FormModal, FormTextarea, useZodForm } from "@tarodan/ui/form";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { productRejectSchema, type ProductRejectValues } from "../_lib/schema";

export function ProductRejectModal({
  open,
  onClose,
  productId,
}: {
  open: boolean;
  onClose: () => void;
  productId: string;
}) {
  const t = useTranslations();
  const form = useZodForm(productRejectSchema(t), {
    defaultValues: { reason: "" },
  });
  const save = useAdminMutation(
    (v: ProductRejectValues) => adminApi.rejectProduct(productId, v.reason),
    {
      invalidates: ["products"],
      successMessage: t("admin.catalog.products.rejected"),
      onSuccess: onClose,
    },
  );

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={t("admin.catalog.products.rejectTitle")}
      form={form}
      onSubmit={(v) => save.mutate(v)}
      isSubmitting={save.isPending}
      submitLabel={t("admin.catalog.products.reject")}
    >
      <FormTextarea
        name="reason"
        label={t("admin.catalog.products.rejectNoteLabel")}
        rows={4}
        placeholder={t("admin.catalog.products.rejectNotePlaceholder")}
      />
    </FormModal>
  );
}

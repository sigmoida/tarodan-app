"use client";

import { FormModal, FormTextarea, useZodForm } from "@tarodan/ui/form";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import {
  productApproveSchema,
  type ProductApproveValues,
} from "../_lib/schema";

export function ProductApproveModal({
  open,
  onClose,
  productId,
}: {
  open: boolean;
  onClose: () => void;
  productId: string;
}) {
  const t = useTranslations();
  const form = useZodForm(productApproveSchema(t), {
    defaultValues: { note: "" },
  });
  const save = useAdminMutation(
    (v: ProductApproveValues) =>
      adminApi.approveProduct(productId, v.note || undefined),
    {
      invalidates: ["products"],
      successMessage: t("admin.catalog.products.approved"),
      onSuccess: onClose,
    },
  );

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={t("admin.catalog.products.approveModalTitle")}
      form={form}
      onSubmit={(v) => save.mutate(v)}
      isSubmitting={save.isPending}
      submitLabel={t("admin.catalog.products.approve")}
    >
      <FormTextarea
        name="note"
        label={t("admin.catalog.products.noteOptional")}
        rows={3}
        placeholder={t("admin.catalog.products.approveNotePlaceholder")}
      />
    </FormModal>
  );
}

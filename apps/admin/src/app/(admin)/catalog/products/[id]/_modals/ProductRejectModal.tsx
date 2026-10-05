"use client";

import {
  FormModal,
  FormSelect,
  FormTextarea,
  useZodForm,
} from "@tarodan/ui/form";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { violationCodeOptions } from "@/lib/listing-removal";
import { productRejectSchema, type ProductRejectValues } from "../_lib/schema";

/**
 * Red: satıcıya giden gerekçe (kalıcı) + kaldırma kaydının ihlal kodu
 * (yalnız yöneticiler görür; dashboard'daki "kural ihlalleri" kırılımı).
 */
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
    defaultValues: { reason: "", violationCode: "" },
  });
  const save = useAdminMutation(
    (v: ProductRejectValues) =>
      adminApi.rejectProduct(productId, {
        reason: v.reason,
        violationCode: v.violationCode,
      }),
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
      <FormSelect
        name="violationCode"
        label={t("admin.catalog.products.removal.violationLabel")}
        placeholder={t("admin.catalog.products.removal.violationPlaceholder")}
        options={violationCodeOptions(t)}
      />
      <FormTextarea
        name="reason"
        label={t("admin.catalog.products.rejectNoteLabel")}
        rows={4}
        placeholder={t("admin.catalog.products.rejectNotePlaceholder")}
      />
    </FormModal>
  );
}

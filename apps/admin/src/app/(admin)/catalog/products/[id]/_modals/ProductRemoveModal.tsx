"use client";

import { useRouter } from "next/navigation";
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
import { productRemoveSchema, type ProductRemoveValues } from "../_lib/schema";

/**
 * Yönetici kaldırması ("Kaldırıldı" durumu): ihlal kodu zorunlu, açıklama
 * opsiyonel (`other` kodunda zorunlu). Kod ve açıklama kaldırma kaydına
 * yazılır; satıcıya gösterilmez. Geri Yükle ile geri alınabilir.
 */
export function ProductRemoveModal({
  open,
  onClose,
  productId,
}: {
  open: boolean;
  onClose: () => void;
  productId: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const form = useZodForm(productRemoveSchema(t), {
    defaultValues: { violationCode: "", note: "" },
  });
  const remove = useAdminMutation(
    (v: ProductRemoveValues) =>
      adminApi.deleteProduct(productId, {
        violationCode: v.violationCode,
        note: v.note || undefined,
      }),
    {
      invalidates: ["products"],
      successMessage: t("admin.catalog.products.removed"),
      onSuccess: () => {
        onClose();
        router.push("/catalog/products");
      },
    },
  );

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={t("admin.catalog.products.removeTitle")}
      form={form}
      onSubmit={(v) => remove.mutate(v)}
      isSubmitting={remove.isPending}
      submitLabel={t("common.remove")}
      destructive
    >
      <p className="text-sm text-muted">
        {t("admin.catalog.products.removeDescription")}
      </p>
      <FormSelect
        name="violationCode"
        label={t("admin.catalog.products.removal.violationLabel")}
        placeholder={t("admin.catalog.products.removal.violationPlaceholder")}
        options={violationCodeOptions(t)}
      />
      <FormTextarea
        name="note"
        label={t("admin.catalog.products.removal.removeNoteLabel")}
        rows={3}
        placeholder={t("admin.catalog.products.removal.removeNotePlaceholder")}
      />
    </FormModal>
  );
}

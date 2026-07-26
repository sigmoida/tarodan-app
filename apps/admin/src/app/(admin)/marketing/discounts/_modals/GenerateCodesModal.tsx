"use client";

import { FormModal, FormInput, useZodForm } from "@tarodan/ui/form";
import { z } from "zod";
import toast from "react-hot-toast";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { useTranslations } from "next-intl";
import { type Discount } from "../_lib/types";

const schema = z.object({
  count: z.string().default("100"),
  prefix: z.string().optional().default(""),
});
type Values = z.infer<typeof schema>;

/** Generate bulk single-use voucher codes under a discount (batch template). */
export function GenerateCodesModal({
  open,
  onClose,
  discount,
}: {
  open: boolean;
  onClose: () => void;
  discount: Discount;
}) {
  const t = useTranslations();
  const form = useZodForm(schema, {
    defaultValues: { count: "100", prefix: "" },
  });

  const generate = useAdminMutation(
    (v: Values) =>
      adminApi.post(`/admin/discounts/${discount.id}/codes`, {
        count: parseInt(v.count, 10) || 0,
        prefix: v.prefix?.trim() || undefined,
      }),
    {
      invalidates: ["discounts"],
      errorMessage: t("admin.marketing.discounts.codes.generateFailed"),
      onSuccess: (res: { data?: { generated?: number; total?: number } }) => {
        toast.success(
          t("admin.marketing.discounts.codes.generated", {
            count: res?.data?.generated ?? 0,
            total: res?.data?.total ?? 0,
          }),
        );
        onClose();
      },
    },
  );

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={t("admin.marketing.discounts.codes.title")}
      form={form}
      onSubmit={(v) => generate.mutate(v)}
      isSubmitting={generate.isPending}
      submitLabel={t("admin.marketing.discounts.codes.generate")}
    >
      <p className="text-sm text-muted">{discount.name}</p>
      <p className="text-xs text-muted">
        {t("admin.marketing.discounts.codes.help")}
      </p>
      <FormInput
        name="count"
        type="number"
        min="1"
        max="10000"
        label={t("admin.marketing.discounts.codes.count")}
      />
      <FormInput
        name="prefix"
        label={t("admin.marketing.discounts.codes.prefix")}
        placeholder="YILBASI"
        className="font-mono uppercase"
        helperText={t("admin.marketing.discounts.codes.prefixHelper")}
      />
    </FormModal>
  );
}

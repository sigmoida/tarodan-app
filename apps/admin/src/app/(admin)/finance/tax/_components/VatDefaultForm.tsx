"use client";

import { Button } from "@tarodan/ui";
import { Form, FormInput, useZodForm } from "@tarodan/ui/form";
import { adminApi } from "@/lib/api";
import { SectionCard } from "@/components/detail/SectionCard";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { vatDefaultSchema } from "../_lib/schema";
import { useTranslations } from "next-intl";

/**
 * Default VAT rate editor. Seeded from the server value via RHF's `values`
 * (reseeds after each save's refetch — no useEffect mirror). Range validation
 * lives in the schema (was a manual toast before).
 */
export function VatDefaultForm({ defaultRate }: { defaultRate?: number }) {
  const t = useTranslations();
  const form = useZodForm(vatDefaultSchema(t), {
    values: { rate: String(defaultRate ?? 20) },
  });

  const save = useAdminMutation(
    (rate: number) => adminApi.setDefaultVat(rate),
    {
      invalidates: ["vat-config"],
      successMessage: t("admin.finance.tax.defaultVatUpdated"),
    },
  );

  return (
    <SectionCard
      title={t("admin.finance.tax.defaultVatRate")}
      bodyClassName="space-y-4"
    >
      <p className="text-sm text-muted">
        {t("admin.finance.tax.defaultVatDescription")}
      </p>
      <Form
        form={form}
        onSubmit={(v) => save.mutate(Number(v.rate))}
        className="flex flex-wrap items-end gap-3"
      >
        <FormInput
          name="rate"
          type="number"
          min={0}
          max={100}
          step={0.01}
          label={t("admin.finance.tax.vatRatePercent")}
          placeholder="20"
          className="w-32"
        />
        <Button type="submit" isLoading={save.isPending}>
          {t("common.save")}
        </Button>
      </Form>
    </SectionCard>
  );
}

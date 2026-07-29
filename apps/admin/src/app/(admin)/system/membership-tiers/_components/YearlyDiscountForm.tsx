"use client";

import { useTranslations } from "next-intl";
import { Button, Skeleton } from "@tarodan/ui";
import { Form, FormInput, useZodForm } from "@tarodan/ui/form";
import { adminApi } from "@/lib/api";
import { SectionCard } from "@/components/detail/SectionCard";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { yearlyDiscountSchema } from "../_lib/schema";

/**
 * Yearly discount % editor. Seeded from the server value via RHF's `values`
 * (reseeds after each save's refetch — no useEffect mirror). Saving also makes
 * the backend recompute every tier's yearly price, so both queries invalidate.
 */
export function YearlyDiscountForm({
  value,
  loading = false,
}: {
  value: number;
  loading?: boolean;
}) {
  const t = useTranslations();
  const form = useZodForm(yearlyDiscountSchema(t), {
    values: { discount: String(value) },
  });

  const save = useAdminMutation(
    (pct: number) =>
      adminApi.updateSetting("yearly_discount_percentage", String(pct)),
    {
      invalidates: ["membership-yearly-discount", "membership-tiers"],
      successMessage: t("admin.tiers.yearlyDiscount.saved"),
    },
  );

  if (loading) {
    return (
      <SectionCard
        title={t("admin.tiers.yearlyDiscount.title")}
        bodyClassName="space-y-3"
      >
        <div className="flex items-end gap-4" aria-busy>
          <div className="w-48 space-y-1.5">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
          <Skeleton className="h-10 w-20" />
        </div>
        <Skeleton className="h-4 w-full max-w-md" />
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title={t("admin.tiers.yearlyDiscount.title")}
      bodyClassName="space-y-3"
    >
      <Form
        form={form}
        onSubmit={(v) => save.mutate(Number(v.discount))}
        className="flex items-end gap-4"
      >
        <FormInput
          name="discount"
          type="number"
          step="0.1"
          min="0"
          max="100"
          label={t("admin.tiers.yearlyDiscount.label")}
          placeholder="10"
          className="w-48"
        />
        <Button type="submit" isLoading={save.isPending}>
          {t("common.save")}
        </Button>
      </Form>
      <p className="text-xs text-muted">
        {t("admin.tiers.yearlyDiscount.helper")}
      </p>
    </SectionCard>
  );
}

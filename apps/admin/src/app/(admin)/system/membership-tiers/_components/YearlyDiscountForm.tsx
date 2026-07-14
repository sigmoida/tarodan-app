"use client";

import { Button } from "@tarodan/ui";
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
export function YearlyDiscountForm({ value }: { value: number }) {
  const form = useZodForm(yearlyDiscountSchema, {
    values: { discount: String(value) },
  });

  const save = useAdminMutation(
    (pct: number) =>
      adminApi.updateSetting("yearly_discount_percentage", String(pct)),
    {
      invalidates: ["membership-yearly-discount", "membership-tiers"],
      successMessage: "Yıllık indirim oranı güncellendi",
    },
  );

  return (
    <SectionCard title="Yıllık İndirim Oranı" bodyClassName="space-y-3">
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
          label="İndirim Yüzdesi (%)"
          className="w-48"
        />
        <Button type="submit" isLoading={save.isPending}>
          Kaydet
        </Button>
      </Form>
      <p className="text-xs text-muted">
        Yıllık fiyat = Aylık Fiyat × 12 × (1 − İndirim%) · Değiştirildiğinde tüm
        katmanların yıllık fiyatı otomatik güncellenir.
      </p>
    </SectionCard>
  );
}

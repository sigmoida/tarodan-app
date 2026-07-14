"use client";

import { Button } from "@tarodan/ui";
import { Form, FormInput, useZodForm } from "@tarodan/ui/form";
import { adminApi } from "@/lib/api";
import { SectionCard } from "@/components/detail/SectionCard";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { vatDefaultSchema } from "../_lib/schema";

/**
 * Default VAT rate editor. Seeded from the server value via RHF's `values`
 * (reseeds after each save's refetch — no useEffect mirror). Range validation
 * lives in the schema (was a manual toast before).
 */
export function VatDefaultForm({ defaultRate }: { defaultRate?: number }) {
  const form = useZodForm(vatDefaultSchema, {
    values: { rate: String(defaultRate ?? 20) },
  });

  const save = useAdminMutation(
    (rate: number) => adminApi.setDefaultVat(rate),
    {
      invalidates: ["vat-config"],
      successMessage: "Varsayılan KDV oranı güncellendi",
    },
  );

  return (
    <SectionCard title="Varsayılan KDV Oranı" bodyClassName="space-y-4">
      <p className="text-sm text-muted">
        Tarodan&apos;ın kestiği komisyon/hizmet bedeli e-belgeleri ve kurumsal
        satıcı siparişlerindeki KDV bu oranla hesaplanır. Bireysel satıcı
        satışlarında KDV uygulanmaz.
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
          label="KDV Oranı (%)"
          className="w-32"
        />
        <Button type="submit" isLoading={save.isPending}>
          Kaydet
        </Button>
      </Form>
    </SectionCard>
  );
}

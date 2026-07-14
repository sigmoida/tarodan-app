"use client";

import { Button } from "@tarodan/ui";
import { Form, FormInput, FormSelect, useZodForm } from "@tarodan/ui/form";
import { adminApi } from "@/lib/api";
import { SectionCard } from "@/components/detail/SectionCard";
import { DataTable } from "@/components/DataTable";
import { useConfirm } from "@/provider/ConfirmProvider";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { useCategories } from "@/hooks/useCategories";
import { vatColumns } from "../_lib/columns";
import { vatOverrideSchema } from "../_lib/schema";
import { type VatConfig, type VatOverride } from "../_lib/types";

/**
 * Per-category VAT override editor + list. The add/update form clears itself on
 * success via `form.reset()`; delete goes through the shared confirm provider.
 */
export function VatOverrideForm({ config }: { config?: VatConfig }) {
  const confirm = useConfirm();
  const { data: categories = [] } = useCategories();

  const form = useZodForm(vatOverrideSchema, {
    defaultValues: { categoryId: "", rate: "0" },
  });

  const addOverride = useAdminMutation(
    (v: { categoryId: string; rate: number }) =>
      adminApi.setVatOverride(v.categoryId, v.rate),
    {
      invalidates: ["vat-config"],
      successMessage: "Kategori istisnası kaydedildi",
      onSuccess: () => form.reset({ categoryId: "", rate: "0" }),
    },
  );
  const removeOverride = useAdminMutation(
    (ruleId: string) => adminApi.deleteVatOverride(ruleId),
    {
      invalidates: ["vat-config"],
      successMessage: "Silindi",
    },
  );

  const onDelete = async (o: VatOverride) => {
    if (
      await confirm({
        title: `"${o.categoryName}" KDV istisnası silinsin mi?`,
        description: "Bu kategori tekrar varsayılan KDV oranına döner.",
        confirmLabel: "Sil",
        destructive: true,
      })
    )
      removeOverride.mutate(o.ruleId);
  };

  const columns = vatColumns(onDelete);

  return (
    <SectionCard title="Kategori Bazlı İstisnalar" bodyClassName="space-y-4">
      <p className="text-sm text-muted">
        Belirli kategorilerde farklı KDV oranı gerekiyorsa (örn. kitap %0)
        buradan tanımlayın. Tanımsız kategoriler varsayılan oranı kullanır.
      </p>
      <Form
        form={form}
        onSubmit={(v) =>
          addOverride.mutate({ categoryId: v.categoryId, rate: Number(v.rate) })
        }
        className="flex flex-wrap items-end gap-3"
      >
        <FormSelect
          name="categoryId"
          label="Kategori"
          placeholder="Seçin"
          options={categories.map((c) => ({ value: c.id, label: c.name }))}
          className="min-w-48"
        />
        <FormInput
          name="rate"
          type="number"
          min={0}
          max={100}
          step={0.01}
          label="KDV Oranı (%)"
          className="w-32"
        />
        <Button type="submit" isLoading={addOverride.isPending}>
          Ekle / Güncelle
        </Button>
      </Form>
      <DataTable
        columns={columns}
        data={config?.overrides ?? []}
        getRowId={(o) => o.ruleId}
        emptyText="Kategori istisnası yok — tüm kategoriler varsayılan oranı kullanıyor."
      />
    </SectionCard>
  );
}

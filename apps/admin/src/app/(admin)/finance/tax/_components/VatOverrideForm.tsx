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
import { useTranslations } from "next-intl";

/**
 * Per-category VAT override editor + list. The add/update form clears itself on
 * success via `form.reset()`; delete goes through the shared confirm provider.
 */
export function VatOverrideForm({ config }: { config?: VatConfig }) {
  const t = useTranslations();
  const confirm = useConfirm();
  const { data: categories = [] } = useCategories();

  const form = useZodForm(vatOverrideSchema(t), {
    defaultValues: { categoryId: "", rate: "0" },
  });

  const addOverride = useAdminMutation(
    (v: { categoryId: string; rate: number }) =>
      adminApi.setVatOverride(v.categoryId, v.rate),
    {
      invalidates: ["vat-config"],
      successMessage: t("admin.finance.tax.overrideSaved"),
      onSuccess: () => form.reset({ categoryId: "", rate: "0" }),
    },
  );
  const removeOverride = useAdminMutation(
    (ruleId: string) => adminApi.deleteVatOverride(ruleId),
    {
      invalidates: ["vat-config"],
      successMessage: t("admin.finance.tax.overrideDeleted"),
    },
  );

  const onDelete = async (o: VatOverride) => {
    await confirm({
      title: t("admin.finance.tax.deleteOverrideTitle", {
        category: o.categoryName,
      }),
      description: t("admin.finance.tax.deleteOverrideDescription"),
      confirmLabel: t("common.delete"),
      destructive: true,
      onConfirm: () => removeOverride.mutateAsync(o.ruleId),
    });
  };

  const columns = vatColumns(onDelete, t);

  return (
    <SectionCard
      title={t("admin.finance.tax.categoryOverrides")}
      bodyClassName="space-y-4"
    >
      <p className="text-sm text-muted">
        {t("admin.finance.tax.categoryOverridesDescription")}
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
          label={t("common.category")}
          placeholder={t("common.select")}
          options={categories.map((c) => ({ value: c.id, label: c.name }))}
          className="min-w-48"
        />
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
        <Button type="submit" isLoading={addOverride.isPending}>
          {t("admin.finance.tax.addOrUpdate")}
        </Button>
      </Form>
      {/* Non-list DataTable (#383): a small inline editor grid for the current
          config's VAT overrides — not a searchable/sortable resource list. */}
      <DataTable
        columns={columns}
        data={config?.overrides ?? []}
        getRowId={(o) => o.ruleId}
        emptyText={t("admin.finance.tax.noOverrides")}
      />
    </SectionCard>
  );
}

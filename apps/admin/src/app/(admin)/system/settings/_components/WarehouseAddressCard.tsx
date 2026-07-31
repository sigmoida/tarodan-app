"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Button } from "@tarodan/ui";
import { Form, FormInput, useZodForm } from "@tarodan/ui/form";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { SectionCard } from "@/components/detail/SectionCard";
import {
  type WarehouseAddress,
  type WarehouseAddressFormValues,
  toWarehouseFormValues,
  warehouseAddressSchema,
} from "../_lib/warehouse";

/**
 * Safe-trade warehouse address (`warehouse_address_id` platform setting).
 * Trade escrow flows fail without it, so it is editable here rather than
 * through the generic numeric settings form.
 */
export function WarehouseAddressCard() {
  const t = useTranslations();

  const query = useQuery<WarehouseAddress | null>({
    queryKey: adminKeys.all("warehouse-address"),
    queryFn: async () => {
      const raw = (await adminApi.getWarehouseAddress()).data;
      return (raw?.data ?? raw ?? null) as WarehouseAddress | null;
    },
  });

  const form = useZodForm(warehouseAddressSchema(t), {
    values:
      query.data !== undefined ? toWarehouseFormValues(query.data) : undefined,
  });

  const save = useAdminMutation(
    (v: WarehouseAddressFormValues) =>
      adminApi.updateWarehouseAddress({
        title: v.title || undefined,
        fullName: v.fullName,
        phone: v.phone,
        city: v.city,
        district: v.district,
        address: v.address,
        zipCode: v.zipCode || undefined,
      }),
    {
      invalidates: ["warehouse-address"],
      successMessage: t("admin.settings.warehouse.saved"),
    },
  );

  return (
    <Form form={form} onSubmit={(v) => save.mutate(v)} className="space-y-6">
      <SectionCard title={t("admin.settings.warehouse.title")}>
        <p className="mb-6 text-sm text-muted">
          {t("admin.settings.warehouse.helper")}
        </p>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <FormInput
            name="title"
            label={t("admin.settings.warehouse.fields.title")}
            placeholder="Tarodan Deposu"
          />
          <FormInput
            name="fullName"
            label={t("admin.settings.warehouse.fields.fullName")}
          />
          <FormInput
            name="phone"
            label={t("admin.settings.warehouse.fields.phone")}
            placeholder="+90…"
          />
          <FormInput
            name="city"
            label={t("admin.settings.warehouse.fields.city")}
          />
          <FormInput
            name="district"
            label={t("admin.settings.warehouse.fields.district")}
          />
          <FormInput
            name="zipCode"
            label={t("admin.settings.warehouse.fields.zipCode")}
          />
          <div className="md:col-span-2">
            <FormInput
              name="address"
              label={t("admin.settings.warehouse.fields.address")}
            />
          </div>
        </div>
      </SectionCard>

      <div className="flex justify-end">
        <Button type="submit" isLoading={save.isPending}>
          {t("admin.settings.saveButton")}
        </Button>
      </div>
    </Form>
  );
}

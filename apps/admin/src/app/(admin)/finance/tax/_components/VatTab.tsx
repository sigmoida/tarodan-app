"use client";

import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { VatDefaultForm } from "./VatDefaultForm";
import { VatOverrideForm } from "./VatOverrideForm";
import { type VatConfig } from "../_lib/types";

/** KDV tab: default rate + per-category overrides. Each block is its own RHF/zod form. */
export function VatTab() {
  const { data: config } = useQuery({
    queryKey: adminKeys.all("vat-config"),
    queryFn: async () => (await adminApi.getVatConfig()).data as VatConfig,
  });

  return (
    <div className="space-y-6">
      <VatDefaultForm defaultRate={config?.defaultRate} />
      <VatOverrideForm config={config} />
    </div>
  );
}

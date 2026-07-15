"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Select } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { useFilter } from "@/components/list";
import type { Brand } from "../_lib/types";

/** Brand filter for the car-models list (server-side via getCarModels(brandId)). */
export function CarModelFilters() {
  const t = useTranslations();
  const [brandId, setBrandId] = useFilter("brandId");
  const { data: brands = [] } = useQuery<Brand[]>({
    queryKey: adminKeys.options("brands"),
    queryFn: async () => (await adminApi.getBrands()).data?.data ?? [],
  });

  return (
    <Select
      bare
      value={brandId}
      onChange={(e) => setBrandId(e.target.value)}
      className="w-full sm:w-56"
    >
      <option value="">{t("admin.catalog.carModels.allBrandsFilter")}</option>
      {brands.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </Select>
  );
}

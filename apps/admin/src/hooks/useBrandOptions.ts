"use client";

import { useQuery } from "@tanstack/react-query";
import type { SelectOption } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";

interface BrandOption {
  id: string;
  name: string;
}

interface CarModelOption extends BrandOption {
  brandId: string;
}

/**
 * Brand/car-model option lists for filter schemas. Both the catalog products
 * list and the car-models list filter by brand, and both used to run the same
 * query inline — this keeps one query key (`adminKeys.options`) and one shape.
 */
export function useBrandOptions(): BrandOption[] {
  const { data = [] } = useQuery<BrandOption[]>({
    queryKey: adminKeys.options("brands"),
    queryFn: async () =>
      (await adminApi.getBrands({ limit: 100 })).data?.data ?? [],
  });
  return data;
}

export function useCarModelOptions(): CarModelOption[] {
  const { data = [] } = useQuery<CarModelOption[]>({
    queryKey: adminKeys.options("car-models"),
    queryFn: async () =>
      (await adminApi.getCarModels({ limit: 100 })).data?.data ?? [],
  });
  return data;
}

/** `[{ value: "", label: allLabel }, ...items]` — the shape a select field wants. */
export function toSelectOptions(
  items: BrandOption[],
  allLabel: string,
): SelectOption[] {
  return [
    { value: "", label: allLabel },
    ...items.map((item) => ({ value: item.id, label: item.name })),
  ];
}

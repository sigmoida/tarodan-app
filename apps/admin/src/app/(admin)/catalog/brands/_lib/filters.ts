import type { FilterField, TranslateFn } from "@/components/list/filters/types";
import { taxonomyFilterFields } from "../../_lib/taxonomyFilters";

export const brandFilterFields = (t: TranslateFn): FilterField[] =>
  taxonomyFilterFields(t, t("admin.catalog.brands.allBrands"));

import type { FilterField, TranslateFn } from "@/components/list/filters/types";
import { taxonomyFilterFields } from "../../_lib/taxonomyFilters";

export const manufacturerFilterFields = (t: TranslateFn): FilterField[] =>
  taxonomyFilterFields(t, t("admin.catalog.manufacturers.allManufacturers"));

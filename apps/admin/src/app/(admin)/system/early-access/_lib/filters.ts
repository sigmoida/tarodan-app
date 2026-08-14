import { statusField } from "@/components/list/filters/fields";
import type { FilterField, TranslateFn } from "@/components/list/filters/types";
import { pinStatusFilterOptions } from "./types";

export const earlyAccessFilterFields = (t: TranslateFn): FilterField[] => [
  statusField(t, pinStatusFilterOptions(t)),
];

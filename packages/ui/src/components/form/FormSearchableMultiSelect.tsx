"use client";

import { useController } from "react-hook-form";
import {
  SearchableMultiSelect,
  type SearchableMultiSelectProps,
} from "../SearchableMultiSelect";
import type { SearchableSelectOption } from "../SearchableSelect";

export interface FormSearchableMultiSelectProps extends Omit<
  SearchableMultiSelectProps,
  "value" | "onChange" | "error"
> {
  /** Field name in the form schema — an array of `{ value, label }` objects
   *  (labels travel with the selection so chips survive result changes). */
  name: string;
}

/** `SearchableMultiSelect` wired to the form by `name` (`useController`). */
export function FormSearchableMultiSelect({
  name,
  ...props
}: FormSearchableMultiSelectProps) {
  const { field, fieldState } = useController({ name });
  return (
    <SearchableMultiSelect
      {...props}
      value={(field.value as SearchableSelectOption[]) ?? []}
      onChange={field.onChange}
      error={fieldState.error?.message as string | undefined}
    />
  );
}

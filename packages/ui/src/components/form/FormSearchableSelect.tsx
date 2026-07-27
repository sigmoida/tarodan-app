"use client";

import { useController } from "react-hook-form";
import {
  SearchableSelect,
  type SearchableSelectProps,
} from "../SearchableSelect";

export interface FormSearchableSelectProps extends Omit<
  SearchableSelectProps,
  "value" | "onChange" | "error" | "name"
> {
  /** Field name in the form schema. Value is a string. */
  name: string;
}

/**
 * `SearchableSelect` wired to the form by `name`. Uses `useController` (the
 * control is custom, not a native `<select>`); the RHF wrapper counterpart of
 * `FormSelect`.
 */
export function FormSearchableSelect({
  name,
  ...props
}: FormSearchableSelectProps) {
  const { field, fieldState } = useController({ name });
  return (
    <SearchableSelect
      {...props}
      name={name}
      value={(field.value as string) ?? ""}
      onChange={field.onChange}
      error={fieldState.error?.message as string | undefined}
    />
  );
}

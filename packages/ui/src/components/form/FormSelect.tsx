"use client";

import { useController } from "react-hook-form";
import { Select, type SelectProps } from "../Select";

export interface FormSelectProps extends Omit<
  SelectProps,
  "name" | "error" | "value" | "onChange"
> {
  /** Field name in the form schema. */
  name: string;
}

/**
 * Select wired to the form by `name`. Uses `useController` (not `register`)
 * because the design-system Select is a custom (Radix) control, not a native
 * `<select>`. Value is a string.
 */
export function FormSelect({ name, ...props }: FormSelectProps) {
  const { field, fieldState } = useController({ name });
  return (
    <Select
      {...props}
      // Empty → `undefined` (not "") so an unselected field shows its
      // placeholder: Select maps "" to a real item value, which would suppress
      // the placeholder.
      value={(field.value as string) || undefined}
      onChange={(e) => field.onChange(e.target.value)}
      error={fieldState.error?.message as string | undefined}
    />
  );
}

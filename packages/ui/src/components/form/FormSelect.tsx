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
      // Keep the Radix control controlled for its entire lifetime. Select
      // distinguishes this empty form value from a real `value=""` option and
      // keeps showing the placeholder until async form data arrives.
      value={field.value == null ? "" : String(field.value)}
      onChange={(e) => field.onChange(e.target.value)}
      error={fieldState.error?.message as string | undefined}
    />
  );
}

"use client";

import { useController } from "react-hook-form";
import { DatePicker, type DatePickerProps } from "../DatePicker";

export interface FormDatePickerProps extends Omit<
  DatePickerProps,
  "value" | "onChange" | "error"
> {
  /** Field name in the form schema (a `yyyy-mm-dd` string). */
  name: string;
}

/** DatePicker wired to the form by `name` (custom control → `useController`). */
export function FormDatePicker({ name, ...props }: FormDatePickerProps) {
  const { field, fieldState } = useController({ name });
  return (
    <DatePicker
      {...props}
      value={(field.value as string) || ""}
      onChange={(v) => field.onChange(v)}
      error={fieldState.error?.message as string | undefined}
    />
  );
}

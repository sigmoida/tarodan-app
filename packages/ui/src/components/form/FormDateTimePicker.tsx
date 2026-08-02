"use client";

import { useController } from "react-hook-form";
import { DateTimePicker, type DateTimePickerProps } from "../DateTimePicker";

export interface FormDateTimePickerProps extends Omit<
  DateTimePickerProps,
  "value" | "onChange" | "error"
> {
  /** Field name in the form schema (a `yyyy-mm-ddTHH:mm` string). */
  name: string;
}

/** DateTimePicker wired to the form by `name` (custom control → `useController`). */
export function FormDateTimePicker({
  name,
  ...props
}: FormDateTimePickerProps) {
  const { field, fieldState } = useController({ name });
  return (
    <DateTimePicker
      {...props}
      value={(field.value as string) || ""}
      onChange={(v) => field.onChange(v)}
      error={fieldState.error?.message as string | undefined}
    />
  );
}

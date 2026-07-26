"use client";

import * as React from "react";
import { Controller, useFormContext } from "react-hook-form";
import { IbanInput } from "../PaymentInputs";
import type { InputProps } from "../Input";

export interface FormIbanProps extends Omit<
  InputProps,
  "name" | "error" | "value" | "onChange" | "type" | "inputMode"
> {
  /** Field name in the form schema. Stores the raw IBAN (TR + digits, no spaces). */
  name: string;
}

/**
 * RHF-connected IBAN field. The shared `IbanInput` is controlled
 * (`value`/`onValueChange`, live-masked as "TR00 0000 …", uppercased, capped at
 * 26 chars) so it can't use `register`; this bridges it via a `Controller`. The
 * form stores the normalized raw value — pair with `isValidIban` (from
 * `@tarodan/ui`) in the zod schema.
 */
export function FormIban({ name, ...props }: FormIbanProps) {
  const { control, formState } = useFormContext();
  const error = formState.errors[name]?.message as string | undefined;

  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <IbanInput
          {...props}
          error={error}
          value={(field.value as string) ?? ""}
          onValueChange={field.onChange}
          onBlur={field.onBlur}
        />
      )}
    />
  );
}

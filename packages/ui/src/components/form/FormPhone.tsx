"use client";

import * as React from "react";
import { Controller, useFormContext } from "react-hook-form";
import { PhoneInput } from "../PhoneInput";
import { splitPhone, toStoredPhone } from "../../lib/phone";

export interface FormPhoneProps {
  /** Field name in the form schema. Stores one combined value ("+90" + digits). */
  name: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  helperText?: string;
  /**
   * Shown instead of `helperText` when the stored value predates the Turkey-only
   * rule and cannot be displayed in the mask. Pass a translated string; without
   * it the field just opens empty.
   */
  legacyMessage?: string;
  className?: string;
}

/**
 * RHF-connected phone field. The form stores a single normalized string
 * ("+905XXXXXXXXX", or "" when empty); this bridges it to `PhoneInput`, which
 * edits only the national part. While typing, the stored value holds the digits
 * entered so far ("+90532") — completeness is the schema's job (`trPhone`), not
 * the field's, or the control could never accept the first keystroke.
 *
 * A stored value that isn't a Turkish mobile (registration accepted any string
 * before this rule) opens the field empty with `legacyMessage` shown. The form
 * value is left untouched until the user types a new number, so submitting an
 * otherwise-unchanged form cannot silently wipe the old one.
 */
export function FormPhone({
  name,
  label,
  placeholder,
  required,
  disabled,
  helperText,
  legacyMessage,
  className,
}: FormPhoneProps) {
  const { control, formState } = useFormContext();
  const error = formState.errors[name]?.message as string | undefined;

  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => {
        const { national, isLegacy } = splitPhone(field.value as string);
        return (
          <PhoneInput
            name={name}
            label={label}
            error={error}
            helperText={isLegacy ? legacyMessage : helperText}
            placeholder={placeholder}
            required={required}
            disabled={disabled}
            className={className}
            phone={national}
            onPhoneChange={(next) => field.onChange(toStoredPhone(next))}
          />
        );
      }}
    />
  );
}

"use client";

import * as React from "react";
import { Controller, useFormContext } from "react-hook-form";
import { PhoneInput } from "../PhoneInput";
import { combinePhone, splitPhone } from "../../lib/phone";

export interface FormPhoneProps {
  /** Field name in the form schema. Stores one combined value ("+90" + digits). */
  name: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  helperText?: string;
  className?: string;
}

/**
 * RHF-connected phone field. The form stores a single normalized string
 * ("+90" + national digits, no spaces, or "" when empty); this bridges it to the
 * two-control `PhoneInput` via a `Controller` — splitting the stored value into
 * country code + national on display and recombining on change. The country-code
 * dropdown lives in local state so switching it while typing recombines cleanly.
 */
export function FormPhone({
  name,
  label,
  placeholder,
  required,
  disabled,
  helperText,
  className,
}: FormPhoneProps) {
  const { control, formState } = useFormContext();
  const error = formState.errors[name]?.message as string | undefined;

  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => {
        const { countryCode, national } = splitPhone(field.value as string);
        return (
          <PhoneInput
            name={name}
            label={label}
            error={error}
            helperText={helperText}
            placeholder={placeholder}
            required={required}
            disabled={disabled}
            className={className}
            countryCode={countryCode}
            phone={national}
            onCountryCodeChange={(code) =>
              field.onChange(combinePhone(code, national))
            }
            onPhoneChange={(next) =>
              field.onChange(combinePhone(countryCode, next))
            }
          />
        );
      }}
    />
  );
}

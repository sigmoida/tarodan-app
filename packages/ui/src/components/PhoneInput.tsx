/** @format */

"use client";

import React from "react";
import { Input } from "./Input";
import { Select } from "./Select";
import {
  countryCodes,
  DEFAULT_COUNTRY_CODE,
  formatPhoneNumber,
  getPhoneMaxLength,
  getPhonePlaceholder,
} from "../lib/phone";
import { cn } from "../lib/utils";

export interface PhoneInputProps {
  /** Country code, e.g. "+90". */
  countryCode: string;
  onCountryCodeChange: (code: string) => void;
  /** Local (national) number, e.g. "5XX XXX XX XX". */
  phone: string;
  onPhoneChange: (phone: string) => void;
  /** Optional label rendered above (matches the shared `Input`). */
  label?: string;
  /** Error message rendered below; also turns the border red. */
  error?: string;
  /** Helper text below (hidden when `error` is present). */
  helperText?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  name?: string;
  /** Class applied to the combo wrapper. */
  className?: string;
}

/**
 * Country-code `Select` + phone `Input` combo — the single shared phone control
 * (formatting, maxLength and placeholder are managed by country). Built on the
 * shared `Input`/`Select` so it inherits the design system; a single bordered
 * wrapper carries the focus ring so the two controls read as one field. For
 * react-hook-form use `FormPhone` from `@tarodan/ui/form`, which stores one
 * combined "+90…" value and drives this control.
 */
export const PhoneInput: React.FC<PhoneInputProps> = ({
  countryCode = DEFAULT_COUNTRY_CODE,
  onCountryCodeChange,
  phone,
  onPhoneChange,
  label,
  error,
  helperText,
  placeholder,
  required,
  disabled,
  id,
  name,
  className,
}) => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const inputId =
    id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value;
    let cursor = e.target.selectionStart ?? raw.length;

    // If a backspace only removed a formatting space (digits unchanged), also
    // drop the digit before it — otherwise the formatter re-adds the space and
    // the key appears "stuck".
    const digitsOf = (s: string) => s.replace(/\D/g, "");
    if (
      raw.length < phone.length &&
      digitsOf(raw) === digitsOf(phone) &&
      cursor > 0
    ) {
      raw = raw.slice(0, cursor - 1) + raw.slice(cursor);
      cursor -= 1;
    }

    const formatted = formatPhoneNumber(raw, countryCode);
    onPhoneChange(formatted);

    // Rewriting the controlled value jumps the caret to the end; move it back to
    // the equivalent position after the edited digit (mid-string editing).
    const digitsBefore = digitsOf(raw.slice(0, cursor)).length;
    let pos = 0;
    let seen = 0;
    while (pos < formatted.length && seen < digitsBefore) {
      if (/\d/.test(formatted[pos])) seen += 1;
      pos += 1;
    }
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el && document.activeElement === el) el.setSelectionRange(pos, pos);
    });
  };

  const combo = (
    <div
      className={cn(
        "flex w-full items-center rounded-lg border bg-surface-elevated transition-colors",
        error
          ? "border-danger-500 focus-within:border-danger-500 focus-within:ring-1 focus-within:ring-danger-500"
          : "border-border focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500",
        disabled ? "cursor-not-allowed bg-surface opacity-50" : "",
        className,
      )}
    >
      <Select
        value={countryCode}
        onChange={(e) => onCountryCodeChange(e.target.value)}
        disabled={disabled}
        aria-label="Ülke kodu"
        className="w-auto shrink-0 cursor-pointer gap-1 border-0 bg-transparent pl-3 pr-2 font-medium focus:ring-0 focus:ring-offset-0 disabled:opacity-100"
      >
        {countryCodes.map((cc) => (
          <option key={cc.code} value={cc.code}>
            {cc.code} {cc.country}
          </option>
        ))}
      </Select>
      <div className="h-5 w-px shrink-0 bg-border" aria-hidden />
      <Input
        ref={inputRef}
        id={inputId}
        name={name}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        value={phone}
        onChange={handleChange}
        placeholder={placeholder ?? getPhonePlaceholder(countryCode)}
        maxLength={getPhoneMaxLength(countryCode)}
        required={required}
        disabled={disabled}
        className="min-w-0 flex-1 border-0 bg-transparent focus:ring-0 focus:ring-offset-0 disabled:opacity-100"
      />
    </div>
  );

  if (!label && !error && !helperText) return combo;

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="mb-1.5 block text-sm font-medium text-body"
        >
          {label}
        </label>
      )}
      {combo}
      {(error || helperText) && (
        <p
          className={cn(
            "mt-1 text-sm",
            error ? "text-danger-600" : "text-muted",
          )}
        >
          {error || helperText}
        </p>
      )}
    </div>
  );
};

PhoneInput.displayName = "PhoneInput";

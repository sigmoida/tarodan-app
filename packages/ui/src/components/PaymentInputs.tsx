/** @format */

"use client";

import React from "react";
import { Input, type InputProps } from "./Input";

/**
 * Masked, controlled payment inputs built on the shared `Input`. Each keeps a
 * normalized raw `value` (digits, or IBAN uppercase-no-spaces) and reports it via
 * `onValueChange`; the field displays a formatted view. Usable standalone or via
 * react-hook-form `Controller`. Validation regexes/helpers are exported for zod.
 */

const digitsOnly = (v: string) => v.replace(/\D/g, "");

/* ───────────────── validation helpers (for zod / submit) ───────────────── */

/** 15–16 digit PAN (Amex is 15). */
export const CARD_NUMBER_REGEX = /^\d{15,16}$/;
/** MMYY where MM is 01–12. */
export const EXPIRY_REGEX = /^(0[1-9]|1[0-2])\d{2}$/;
/** 3–4 digit CVV. */
export const CVV_REGEX = /^\d{3,4}$/;
/** Turkish IBAN: TR + 24 digits (26 chars). */
export const IBAN_TR_REGEX = /^TR\d{24}$/;

/** Luhn check for a raw PAN (digits only). */
export function isValidCardNumber(raw: string): boolean {
  const n = digitsOnly(raw);
  if (!CARD_NUMBER_REGEX.test(n)) return false;
  let sum = 0;
  let dbl = false;
  for (let i = n.length - 1; i >= 0; i--) {
    let d = n.charCodeAt(i) - 48;
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

/** Expiry not in the past. `raw` is MMYY. */
export function isExpiryValid(raw: string): boolean {
  if (!EXPIRY_REGEX.test(raw)) return false;
  const month = Number(raw.slice(0, 2));
  const year = 2000 + Number(raw.slice(2, 4));
  const now = new Date();
  const lastDay = new Date(year, month, 0, 23, 59, 59);
  return lastDay >= now;
}

/** Parse a raw MMYY string into its parts. */
export function parseExpiry(raw: string): { month: string; year: string } {
  const d = digitsOnly(raw).slice(0, 4);
  return { month: d.slice(0, 2), year: d.slice(2, 4) };
}

/** TR IBAN mod-97 validation (raw = uppercase, no spaces). */
export function isValidIban(raw: string): boolean {
  const v = raw.replace(/\s/g, "").toUpperCase();
  if (!IBAN_TR_REGEX.test(v)) return false;
  const rearranged = v.slice(4) + v.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (c) =>
    String(c.charCodeAt(0) - 55),
  );
  let remainder = 0;
  for (let i = 0; i < numeric.length; i++) {
    remainder = (remainder * 10 + (numeric.charCodeAt(i) - 48)) % 97;
  }
  return remainder === 1;
}

/* ───────────────────────── shared props ───────────────────────── */

type MaskedProps = Omit<
  InputProps,
  "value" | "onChange" | "type" | "inputMode"
> & {
  /** Normalized raw value. */
  value: string;
  /** Called with the normalized raw value. */
  onValueChange: (value: string) => void;
};

/* ───────────────────────── card number ───────────────────────── */

const formatCard = (d: string) => (d.match(/.{1,4}/g) || []).join(" ");

export interface CardNumberInputProps extends MaskedProps {
  /** Max digits (16 default; pass 15 for Amex-only contexts). */
  maxDigits?: number;
}

export const CardNumberInput = React.forwardRef<
  HTMLInputElement,
  CardNumberInputProps
>(({ value, onValueChange, maxDigits = 16, ...rest }, ref) => (
  <Input
    ref={ref}
    inputMode="numeric"
    autoComplete="cc-number"
    placeholder="0000 0000 0000 0000"
    value={formatCard(value)}
    onChange={(e) =>
      onValueChange(digitsOnly(e.target.value).slice(0, maxDigits))
    }
    {...rest}
  />
));
CardNumberInput.displayName = "CardNumberInput";

/* ───────────────────────── expiry (MM/YY) ───────────────────────── */

const formatExpiry = (d: string) => {
  const v = digitsOnly(d).slice(0, 4);
  return v.length <= 2 ? v : `${v.slice(0, 2)}/${v.slice(2)}`;
};

export type ExpiryDateInputProps = MaskedProps;

export const ExpiryDateInput = React.forwardRef<
  HTMLInputElement,
  ExpiryDateInputProps
>(({ value, onValueChange, ...rest }, ref) => (
  <Input
    ref={ref}
    inputMode="numeric"
    autoComplete="cc-exp"
    placeholder="AA/YY"
    maxLength={5}
    value={formatExpiry(value)}
    onChange={(e) => onValueChange(digitsOnly(e.target.value).slice(0, 4))}
    {...rest}
  />
));
ExpiryDateInput.displayName = "ExpiryDateInput";

/* ───────────────────────── CVV (integer) ───────────────────────── */

export interface CvvInputProps extends MaskedProps {
  maxDigits?: number;
}

export const CvvInput = React.forwardRef<HTMLInputElement, CvvInputProps>(
  ({ value, onValueChange, maxDigits = 4, ...rest }, ref) => (
    <Input
      ref={ref}
      inputMode="numeric"
      autoComplete="cc-csc"
      placeholder="•••"
      maxLength={maxDigits}
      value={value}
      onChange={(e) =>
        onValueChange(digitsOnly(e.target.value).slice(0, maxDigits))
      }
      {...rest}
    />
  ),
);
CvvInput.displayName = "CvvInput";

/* ───────────────────────── IBAN (TR) ───────────────────────── */

const formatIban = (v: string) => {
  const s = v.replace(/\s/g, "").toUpperCase();
  return (s.match(/.{1,4}/g) || []).join(" ");
};

export type IbanInputProps = MaskedProps;

export const IbanInput = React.forwardRef<HTMLInputElement, IbanInputProps>(
  ({ value, onValueChange, ...rest }, ref) => (
    <Input
      ref={ref}
      inputMode="numeric"
      autoComplete="off"
      placeholder="TR00 0000 0000 0000 0000 0000 00"
      value={formatIban(value)}
      onChange={(e) => {
        // Auto-prefix "TR": the user only types the 24 account digits. Any
        // typed "TR"/letters/spaces are stripped, then TR is re-attached, so
        // entering just the number never fails the TR + 24-digit validation.
        const digits = e.target.value.replace(/\D/g, "").slice(0, 24);
        onValueChange(digits ? `TR${digits}` : "");
      }}
      {...rest}
    />
  ),
);
IbanInput.displayName = "IbanInput";

/** @format */

"use client";

import React from "react";
import { cn } from "../lib/utils";
import { DatePicker } from "./DatePicker";
import { Input } from "./Input";
import { Label } from "./Label";

export interface DateTimePickerProps {
  /** `yyyy-mm-ddTHH:mm` (the native `datetime-local` value) or "". */
  value?: string;
  onChange: (value: string) => void;
  label?: string;
  error?: string;
  helperText?: string;
  /** Inclusive lower bound as `yyyy-mm-ddTHH:mm` (only the date part bounds the calendar). */
  min?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  inputSize?: "sm" | "md" | "lg";
  locale?: string;
  /** Time slotted in when a date is picked before any time was chosen. */
  defaultTime?: string;
  "aria-label"?: string;
}

/**
 * Design-system date + time picker: the themed `DatePicker` calendar next to a
 * time field, controlled as a single `yyyy-mm-ddTHH:mm` string — a drop-in
 * replacement for a native `<input type="datetime-local">`.
 */
export function DateTimePicker({
  value = "",
  onChange,
  label,
  error,
  helperText,
  min,
  disabled,
  id,
  className,
  inputSize = "md",
  locale,
  defaultTime = "09:00",
  ...aria
}: DateTimePickerProps) {
  const [datePart, timePart = ""] = value.split("T");

  const emit = (date: string, time: string) => {
    if (!date) {
      onChange("");
      return;
    }
    onChange(`${date}T${time || defaultTime}`);
  };

  return (
    <div className={cn("w-full", className)}>
      {label && <Label className="mb-1.5 block">{label}</Label>}
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <DatePicker
          value={datePart || undefined}
          onChange={(date) => emit(date, timePart)}
          min={min?.split("T")[0]}
          disabled={disabled}
          id={id}
          inputSize={inputSize}
          locale={locale}
          {...aria}
        />
        <Input
          type="time"
          value={timePart}
          onChange={(e) => emit(datePart, e.target.value)}
          disabled={disabled || !datePart}
          inputSize={inputSize}
          className="w-28"
          aria-label={
            aria["aria-label"] ? `${aria["aria-label"]} (saat)` : undefined
          }
        />
      </div>
      {error ? (
        <p className="mt-1.5 text-sm text-danger-600">{error}</p>
      ) : helperText ? (
        <p className="mt-1.5 text-sm text-muted">{helperText}</p>
      ) : null}
    </div>
  );
}

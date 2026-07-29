/** @format */

"use client";

import * as React from "react";
import { cn } from "../lib/utils";

/**
 * Adet seçici (− [n] +). Stok-duyarlı: `max`'a gelince `+` kilitlenir, `min`'de
 * (varsayılan 1) `−` kilitlenir. Sepet satırında ve checkout ilk adımında ortak
 * kullanılır (DRY). `onChange` yalnız geçerli, sınır-içi bir değerle çağrılır.
 */
export interface QuantityStepperProps {
  value: number;
  onChange: (next: number) => void;
  /** Alt sınır (varsayılan 1). */
  min?: number;
  /** Üst sınır (mevcut stok ∧ sipariş-cap'i). Yoksa üst sınır uygulanmaz. */
  max?: number;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
  decreaseLabel?: string;
  increaseLabel?: string;
}

const MinusGlyph = () => (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden className="h-4 w-4">
    <path
      d="M5 10h10"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

const PlusGlyph = () => (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden className="h-4 w-4">
    <path
      d="M10 5v10M5 10h10"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max,
  disabled = false,
  size = "md",
  className,
  decreaseLabel = "Azalt",
  increaseLabel = "Arttır",
}: QuantityStepperProps) {
  const atMin = value <= min;
  const atMax = max != null && value >= max;
  const box = size === "sm" ? "h-8 min-w-8 text-sm" : "h-10 min-w-10 text-base";

  const step = (delta: number) => {
    if (disabled) return;
    const next = value + delta;
    if (next < min) return;
    if (max != null && next > max) return;
    onChange(next);
  };

  const btn = cn(
    "flex items-center justify-center rounded-md text-body transition-colors",
    "hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400",
    box,
  );

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border border-border bg-surface p-1",
        className,
      )}
    >
      <button
        type="button"
        className={btn}
        onClick={() => step(-1)}
        disabled={disabled || atMin}
        aria-label={decreaseLabel}
      >
        <MinusGlyph />
      </button>
      <span
        className={cn(
          "select-none px-2 text-center font-semibold text-heading tabular-nums",
          box,
          "flex items-center justify-center",
        )}
        aria-live="polite"
      >
        {value}
      </span>
      <button
        type="button"
        className={btn}
        onClick={() => step(1)}
        disabled={disabled || atMax}
        aria-label={increaseLabel}
      >
        <PlusGlyph />
      </button>
    </div>
  );
}

QuantityStepper.displayName = "QuantityStepper";

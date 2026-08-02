/** @format */

import React from "react";
import { primary, border } from "@tarodan/design-tokens";
import { cn } from "../lib/utils";

export interface SliderProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "size"
> {
  /** Optional label rendered above the track. */
  label?: React.ReactNode;
  /** Value read-out rendered on the right of the label row. */
  valueLabel?: React.ReactNode;
  /** Helper text shown below the track. */
  helperText?: React.ReactNode;
}

const num = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * A range slider built on the native `input[type=range]`, styled with the
 * design-system accent. Use for bounded numeric settings (thresholds, ratios)
 * where a track reads better than a number field.
 *
 * The track is painted by us rather than left to `accent-color`: the browser's
 * default unfilled track is near-black, which reads as a disabled/foreign
 * control on our light surfaces. A two-stop gradient (filled = primary,
 * remainder = border) keeps both halves on design tokens, and the thumb is
 * drawn per engine since `appearance-none` removes the native one.
 */
export const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ label, valueLabel, helperText, className, style, ...props }, ref) => {
    const min = num(props.min, 0);
    const max = num(props.max, 100);
    const value = num(props.value ?? props.defaultValue, min);
    const pct =
      max > min
        ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))
        : 0;

    const track = (
      <input
        ref={ref}
        type="range"
        className={cn(
          "h-4 w-full cursor-pointer appearance-none bg-transparent",
          // Track: transparent pseudo-elements so the input's own gradient
          // background (below) is what the user sees, in both engines.
          "[&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent",
          "[&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-transparent",
          // Thumb (native one is gone once appearance is reset).
          "[&::-webkit-slider-thumb]:-mt-[5px] [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary-500",
          "[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary-500 [&::-moz-range-thumb]:cursor-pointer",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        style={{
          backgroundImage: `linear-gradient(to right, ${primary[500]} 0%, ${primary[500]} ${pct}%, ${border.DEFAULT} ${pct}%, ${border.DEFAULT} 100%)`,
          backgroundSize: "100% 6px",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          borderRadius: "9999px",
          ...style,
        }}
        {...props}
      />
    );

    if (!label && !valueLabel && !helperText) return track;

    return (
      <div className="space-y-2">
        {(label || valueLabel) && (
          <div className="flex items-center justify-between gap-2">
            {label && (
              <span className="text-sm font-medium text-heading">{label}</span>
            )}
            {valueLabel && (
              <span className="font-semibold text-heading">{valueLabel}</span>
            )}
          </div>
        )}
        {track}
        {helperText && <p className="text-sm text-muted">{helperText}</p>}
      </div>
    );
  },
);

Slider.displayName = "Slider";

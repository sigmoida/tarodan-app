/** @format */

"use client";

import React from "react";
import * as RadixSelect from "@radix-ui/react-select";
import { cn } from "../lib/utils";

export interface SelectOption {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
}

export interface SelectProps extends Omit<
  React.SelectHTMLAttributes<HTMLSelectElement>,
  "size"
> {
  /** Optional label rendered above the trigger (full mode). */
  label?: string;
  error?: string;
  helperText?: string;
  /** Array-based options (alternative to children `<option>`). */
  options?: SelectOption[];
  /** Placeholder shown when nothing is selected. */
  placeholder?: string;
  /** Render only the trigger (no wrapper/label). */
  bare?: boolean;
  /** Size variant. */
  selectSize?: "sm" | "md" | "lg";
}

// Radix disallows an empty-string item value (it's reserved for "clear"). Many
// filter selects use `value=""` for an "all" option, so map "" ↔ this sentinel.
const EMPTY = "__empty__";
const toRadix = (v?: string) => (v === "" ? EMPTY : v);
const fromRadix = (v: string) => (v === EMPTY ? "" : v);

const sizeClasses = {
  sm: "h-8 px-2.5 text-sm",
  md: "h-10 px-3 text-sm",
  lg: "h-12 px-4 text-base",
};

/**
 * The Select trigger's class string — exported so other controls (e.g.
 * `SearchableSelect`) can render a visually identical trigger.
 */
export const selectTriggerClasses = (
  error?: string,
  selectSize: "sm" | "md" | "lg" = "md",
) =>
  cn(
    "flex w-full items-center justify-between gap-2 rounded-lg border bg-surface-elevated text-left text-body transition-colors",
    sizeClasses[selectSize],
    "focus:outline-none focus:ring-1 focus:ring-offset-0",
    error
      ? "border-danger-500 focus:border-danger-500 focus:ring-danger-500"
      : "border-border focus:border-primary-500 focus:ring-primary-500",
    "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-surface",
    "data-[placeholder]:text-subtle",
  );

/** Turn `options` OR `<option>` children into a normalized item list. */
function normalizeItems(
  options?: SelectOption[],
  children?: React.ReactNode,
): SelectOption[] {
  if (options) return options;
  const items: SelectOption[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    const p = child.props as {
      value?: React.Key;
      children?: React.ReactNode;
      disabled?: boolean;
    };
    if (p.value === undefined && p.children === undefined) return;
    items.push({
      value: String(p.value ?? ""),
      label: p.children,
      disabled: p.disabled,
    });
  });
  return items;
}

function ChevronIcon() {
  return (
    <svg
      className="h-4 w-4 flex-shrink-0 text-subtle"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m6 8 4 4 4-4" />
    </svg>
  );
}

function CheckMark() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m5 10 3.5 3.5L15 7"
      />
    </svg>
  );
}

/**
 * Styled, custom-rendered select (built on @radix-ui/react-select). Unlike a
 * native `<select>`, the open menu is fully token-styled and matches the design
 * system on every platform. The public API is unchanged — `options` OR `<option>`
 * children, controlled `value`+`onChange(e)` (where `e.target.value` is a string),
 * `placeholder`, `bare`, `label`, `error`, `selectSize` — so existing call sites
 * keep working. For forms use `FormSelect` (RHF `Controller`).
 */
export const Select = React.forwardRef<HTMLButtonElement, SelectProps>(
  (
    {
      className,
      label,
      error,
      helperText,
      options,
      placeholder,
      bare,
      selectSize = "md",
      id,
      children,
      value,
      defaultValue,
      onChange,
      disabled,
      name,
      required,
    },
    ref,
  ) => {
    const items = normalizeItems(options, children);
    const selectId =
      id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    const emit = (v: string) => {
      const real = fromRadix(v);
      onChange?.({
        target: { value: real, name },
      } as React.ChangeEvent<HTMLSelectElement>);
    };

    const control = (
      <RadixSelect.Root
        value={value !== undefined ? toRadix(String(value)) : undefined}
        defaultValue={
          defaultValue !== undefined ? toRadix(String(defaultValue)) : undefined
        }
        onValueChange={emit}
        disabled={disabled}
        name={name}
        required={required}
      >
        <RadixSelect.Trigger
          ref={ref}
          id={selectId}
          className={cn(selectTriggerClasses(error, selectSize), className)}
        >
          <RadixSelect.Value placeholder={placeholder} />
          <RadixSelect.Icon>
            <ChevronIcon />
          </RadixSelect.Icon>
        </RadixSelect.Trigger>
        <RadixSelect.Portal>
          <RadixSelect.Content
            position="popper"
            sideOffset={4}
            className={cn(
              "z-popover max-h-[var(--radix-select-content-available-height)] min-w-[var(--radix-select-trigger-width)]",
              "overflow-hidden rounded-lg border border-border bg-surface-elevated shadow-lg",
            )}
          >
            <RadixSelect.Viewport className="p-1">
              {items.map((opt) => (
                <RadixSelect.Item
                  key={opt.value}
                  value={toRadix(opt.value)!}
                  disabled={opt.disabled}
                  className={cn(
                    "relative flex cursor-pointer select-none items-center justify-between gap-2 rounded-md px-3 py-2 text-sm text-body outline-none",
                    "data-[highlighted]:bg-surface-alt data-[state=checked]:font-medium",
                    "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                  )}
                >
                  <RadixSelect.ItemText>{opt.label}</RadixSelect.ItemText>
                  <RadixSelect.ItemIndicator className="text-primary-600">
                    <CheckMark />
                  </RadixSelect.ItemIndicator>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
    );

    if (bare || (!label && !error && !helperText)) return control;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={selectId}
            className="mb-1.5 block text-sm font-medium text-body"
          >
            {label}
          </label>
        )}
        {control}
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
  },
);

Select.displayName = "Select";

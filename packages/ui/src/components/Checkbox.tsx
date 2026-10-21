/** @format */

"use client";

import React from "react";
import { cn } from "../lib/utils";

export interface CheckboxProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "size"
> {
  /** Optional label rendered to the right of the checkbox */
  label?: React.ReactNode;
  /** Error message shown below */
  error?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /**
   * How the box sits next to the label. `center` (default) centres it on
   * the label; `start` puts it on the label's first line, for labels that
   * wrap to several lines (consent statements). Mobile `Checkbox` always
   * aligns to the first line.
   */
  align?: "center" | "start";
  /**
   * Partial state (some-but-not-all of a group selected) — the native dash.
   * It is a DOM property, not an attribute, so it is applied via the ref.
   * Ignored while `checked` is true.
   */
  indeterminate?: boolean;
}

const sizeClasses = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      className,
      label,
      error,
      size = "md",
      align = "center",
      id,
      indeterminate,
      ...props
    },
    ref,
  ) => {
    const cbId =
      id ||
      (typeof label === "string"
        ? label.toLowerCase().replace(/\s+/g, "-")
        : undefined);

    // Keep the caller's ref working while we drive `indeterminate` ourselves.
    const innerRef = React.useRef<HTMLInputElement | null>(null);
    const setRef = React.useCallback(
      (node: HTMLInputElement | null) => {
        innerRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      },
      [ref],
    );
    React.useEffect(() => {
      if (innerRef.current) {
        innerRef.current.indeterminate = !props.checked && !!indeterminate;
      }
    }, [indeterminate, props.checked]);

    const input = (
      <input
        ref={setRef}
        type="checkbox"
        id={cbId}
        className={cn(
          "shrink-0 cursor-pointer rounded border-border accent-primary-600",
          "focus:ring-2 focus:ring-primary-500 focus:ring-offset-1",
          "disabled:cursor-not-allowed disabled:opacity-50",
          sizeClasses[size],
          error && "border-danger-500",
          className,
        )}
        {...props}
      />
    );

    if (!label) return input;

    return (
      <div className="flex flex-col gap-1">
        <label
          htmlFor={cbId}
          className={cn(
            "inline-flex cursor-pointer gap-2 text-sm text-body",
            align === "start" ? "items-start" : "items-center",
          )}
        >
          {align === "start" ? (
            // A slot one `text-sm` line high (h-5) centres the box on the
            // first line of the label, whatever the box size.
            <span className="flex h-5 shrink-0 items-center">{input}</span>
          ) : (
            input
          )}
          <span>{label}</span>
        </label>
        {error && <p className="text-sm text-danger-600">{error}</p>}
      </div>
    );
  },
);

Checkbox.displayName = "Checkbox";

/** @format */

import React, { useState } from "react";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
import { cn } from "../lib/utils";
import { CONTROL_TEXT } from "../lib/form-control";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Optional label. If provided, renders wrapper with label above. */
  label?: string;
  /** Error message shown below. */
  error?: string;
  /** Helper text shown below (hidden when error present). */
  helperText?: string;
  /** When true, render only the bare input (no wrapper div/label).
   *  Useful for drop-in replacement of inline <input className="..." />. */
  bare?: boolean;
  /** Size variant */
  inputSize?: "sm" | "md" | "lg";
  /** Node rendered inside the input at the left (icon or text). */
  leftAdornment?: React.ReactNode;
  /** Node rendered inside the input at the right (icon or text). */
  rightAdornment?: React.ReactNode;
  /** type="password" alanlarında otomatik göster/gizle (göz) butonunu KAPAT. */
  hidePasswordToggle?: boolean;
}

const sizeClasses = {
  sm: `h-8 ${CONTROL_TEXT}`,
  md: `h-10 ${CONTROL_TEXT}`,
  lg: "h-12 text-base",
};

const sizePaddingX = {
  sm: "px-2.5",
  md: "px-3",
  lg: "px-4",
};

const sizePaddingY = {
  sm: "py-1.5",
  md: "py-2",
  lg: "py-2.5",
};

const inputClasses = (error?: string, inputSize: "sm" | "md" | "lg" = "md") =>
  cn(
    "flex w-full rounded-lg border bg-surface-elevated transition-colors text-body",
    sizeClasses[inputSize],
    sizePaddingX[inputSize],
    sizePaddingY[inputSize],
    "placeholder:text-subtle",
    // Tarayıcının kendi şifre göster/temizle/autofill butonlarını gizle
    // (Edge kutulu göz + Chrome/Safari şifre yöneticisi ikonu, focus'ta belirir).
    "[&::-ms-reveal]:hidden [&::-ms-clear]:hidden",
    "[&::-webkit-credentials-auto-fill-button]:!hidden",
    "[&::-webkit-strong-password-auto-fill-button]:!hidden",
    "[&::-webkit-contacts-auto-fill-button]:!hidden",
    "focus:outline-none focus:ring-1 focus:ring-offset-0",
    error
      ? "border-danger-500 focus:border-danger-500 focus:ring-danger-500"
      : "border-border focus:border-primary-500 focus:ring-primary-500",
    "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-surface",
  );

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      label,
      error,
      helperText,
      bare,
      inputSize = "md",
      leftAdornment,
      rightAdornment,
      hidePasswordToggle,
      type,
      id,
      ...props
    },
    ref,
  ) => {
    const inputId =
      id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    // type="password" → dahili göster/gizle. Her şifre alanı otomatik kazanır;
    // istenmeyen yerde hidePasswordToggle ile kapatılır.
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === "password";
    const enableToggle = isPassword && !hidePasswordToggle;
    const effectiveType = enableToggle && showPassword ? "text" : type;

    const passwordToggle = enableToggle ? (
      <button
        type="button"
        tabIndex={-1}
        // Toggling must not steal focus from the field — keep the input
        // focused (no flicker) and the eye reads as an internal icon, not a
        // separate control with its own focus ring.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => !props.disabled && setShowPassword((v) => !v)}
        aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
        className="flex items-center text-subtle outline-none transition-colors hover:text-body focus:outline-none disabled:cursor-not-allowed"
        disabled={props.disabled}
      >
        {showPassword ? (
          <EyeSlashIcon className="h-5 w-5" />
        ) : (
          <EyeIcon className="h-5 w-5" />
        )}
      </button>
    ) : null;

    // Göz butonu ve/veya özel rightAdornment birlikte olabilir.
    const effectiveRight =
      passwordToggle && rightAdornment ? (
        <>
          {rightAdornment}
          {passwordToggle}
        </>
      ) : (
        (passwordToggle ?? rightAdornment)
      );

    const hasLeft = Boolean(leftAdornment);
    const hasRight = Boolean(effectiveRight);

    // Tek input border + focus ring'i taşır; adornment'lar üstünde absolute durur.
    const renderControl = () => {
      const control = (
        <input
          type={effectiveType}
          id={inputId}
          className={cn(
            inputClasses(error, inputSize),
            hasLeft && "pl-10",
            hasRight && "pr-10",
            className,
          )}
          ref={ref}
          {...props}
        />
      );

      if (!hasLeft && !hasRight) {
        return control;
      }

      return (
        <div className="relative w-full">
          {hasLeft && (
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-subtle">
              {leftAdornment}
            </span>
          )}
          {control}
          {hasRight && (
            <span className="absolute inset-y-0 right-0 flex items-center gap-1 pr-3 text-subtle">
              {effectiveRight}
            </span>
          )}
        </div>
      );
    };

    if (bare || (!label && !error && !helperText)) {
      return renderControl();
    }

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
        {renderControl()}
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

Input.displayName = "Input";

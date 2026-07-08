import React from 'react';
import { cn } from '../lib/utils';
import { Label } from './Label';

export interface FormFieldProps {
  /** Field label. */
  label?: React.ReactNode;
  /** Optional id — propagates to label[htmlFor] and must match the control's id. */
  htmlFor?: string;
  /** Marks label with * and sets aria-required on control wrapper. */
  required?: boolean;
  /** Short helper text below the field (hidden when error is set). */
  helperText?: React.ReactNode;
  /** Error message below the field. */
  error?: React.ReactNode;
  /** Label size variant. */
  labelSize?: 'sm' | 'md' | 'lg';
  className?: string;
  children: React.ReactNode;
}

/**
 * Uniform form-field wrapper: Label + control + error/helper.
 *
 * Use when you need a consistent layout outside of Input/Select/Textarea's
 * built-in label mode (e.g. wrapping a custom control, a group of radios,
 * or a Checkbox that shouldn't render its own label).
 */
export const FormField: React.FC<FormFieldProps> = ({
  label,
  htmlFor,
  required,
  helperText,
  error,
  labelSize = 'md',
  className,
  children,
}) => {
  return (
    <div className={cn('w-full', className)}>
      {label && (
        <Label htmlFor={htmlFor} required={required} size={labelSize}>
          {label}
        </Label>
      )}
      {children}
      {(error || helperText) && (
        <p className={cn('mt-1 text-sm', error ? 'text-danger-600' : 'text-muted')}>
          {error || helperText}
        </p>
      )}
    </div>
  );
};

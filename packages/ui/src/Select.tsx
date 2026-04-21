import React from 'react';
import { cn } from './utils';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Optional label rendered above select (full mode) */
  label?: string;
  error?: string;
  helperText?: string;
  /** Array-based options (alternative to children). Either use options OR children. */
  options?: SelectOption[];
  /** Placeholder option rendered first when options prop is used */
  placeholder?: string;
  /** When true, render only the bare <select> (no wrapper/label).
   *  Useful for drop-in replacement of inline <select className="..." /> with children. */
  bare?: boolean;
  /** Size variant */
  selectSize?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'h-8 px-2.5 py-1.5 text-sm',
  md: 'h-10 px-3 py-2 text-sm',
  lg: 'h-12 px-4 py-2.5 text-base',
};

const selectClasses = (error?: string, selectSize: 'sm' | 'md' | 'lg' = 'md') =>
  cn(
    'flex w-full rounded-lg border bg-white transition-colors',
    sizeClasses[selectSize],
    'focus:outline-none focus:ring-2 focus:ring-offset-1',
    error
      ? 'border-danger-500 focus:border-danger-500 focus:ring-danger-200'
      : 'border-gray-300 focus:border-primary-500 focus:ring-primary-200',
    'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-gray-50',
  );

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      className,
      label,
      error,
      helperText,
      options,
      placeholder,
      bare,
      selectSize = 'md',
      id,
      children,
      ...props
    },
    ref,
  ) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    // Render either options-array or children (mutually exclusive — options wins)
    const optionContent = options
      ? (
        <>
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </option>
          ))}
        </>
      )
      : children;

    const selectEl = (
      <select
        id={selectId}
        className={cn(selectClasses(error, selectSize), className)}
        ref={ref}
        {...props}
      >
        {optionContent}
      </select>
    );

    // Bare mode: no wrapper/label (drop-in for inline <select>)
    if (bare || (!label && !error && !helperText)) {
      return selectEl;
    }

    // Full mode
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={selectId}
            className="mb-1.5 block text-sm font-medium text-gray-700"
          >
            {label}
          </label>
        )}
        {selectEl}
        {(error || helperText) && (
          <p className={cn('mt-1 text-sm', error ? 'text-danger-600' : 'text-gray-500')}>
            {error || helperText}
          </p>
        )}
      </div>
    );
  },
);

Select.displayName = 'Select';

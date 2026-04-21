import React from 'react';
import { cn } from './utils';

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
  inputSize?: 'sm' | 'md' | 'lg';
  /** Node rendered inside the input at the left (icon or text). */
  leftAdornment?: React.ReactNode;
  /** Node rendered inside the input at the right (icon or text). */
  rightAdornment?: React.ReactNode;
}

const sizeClasses = {
  sm: 'h-8 text-sm',
  md: 'h-10 text-sm',
  lg: 'h-12 text-base',
};

const sizePaddingX = {
  sm: 'px-2.5',
  md: 'px-3',
  lg: 'px-4',
};

const sizePaddingY = {
  sm: 'py-1.5',
  md: 'py-2',
  lg: 'py-2.5',
};

const inputClasses = (error?: string, inputSize: 'sm' | 'md' | 'lg' = 'md') =>
  cn(
    'flex w-full rounded-lg border bg-white transition-colors',
    sizeClasses[inputSize],
    sizePaddingX[inputSize],
    sizePaddingY[inputSize],
    'placeholder:text-gray-400',
    'focus:outline-none focus:ring-2 focus:ring-offset-1',
    error
      ? 'border-danger-500 focus:border-danger-500 focus:ring-danger-200'
      : 'border-gray-300 focus:border-primary-500 focus:ring-primary-200',
    'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-gray-50',
  );

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      label,
      error,
      helperText,
      bare,
      inputSize = 'md',
      leftAdornment,
      rightAdornment,
      type,
      id,
      ...props
    },
    ref,
  ) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
    const hasAdornment = Boolean(leftAdornment || rightAdornment);

    const renderControl = () => {
      if (!hasAdornment) {
        return (
          <input
            type={type}
            id={inputId}
            className={cn(inputClasses(error, inputSize), className)}
            ref={ref}
            {...props}
          />
        );
      }
      // With adornment: input loses side padding; wrapper carries border.
      return (
        <div
          className={cn(
            'flex w-full items-center rounded-lg border bg-white transition-colors',
            sizeClasses[inputSize],
            'focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-1',
            error
              ? 'border-danger-500 focus-within:border-danger-500 focus-within:ring-danger-200'
              : 'border-gray-300 focus-within:border-primary-500 focus-within:ring-primary-200',
            props.disabled && 'cursor-not-allowed opacity-50 bg-gray-50',
            className,
          )}
        >
          {leftAdornment && (
            <span className={cn('flex items-center pl-3 text-gray-400', sizePaddingY[inputSize])}>
              {leftAdornment}
            </span>
          )}
          <input
            type={type}
            id={inputId}
            className={cn(
              'flex w-full bg-transparent outline-none placeholder:text-gray-400 disabled:cursor-not-allowed',
              sizePaddingX[inputSize],
              sizePaddingY[inputSize],
              leftAdornment ? 'pl-2' : '',
              rightAdornment ? 'pr-2' : '',
            )}
            ref={ref}
            {...props}
          />
          {rightAdornment && (
            <span className={cn('flex items-center pr-3 text-gray-400', sizePaddingY[inputSize])}>
              {rightAdornment}
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
            className="mb-1.5 block text-sm font-medium text-gray-700"
          >
            {label}
          </label>
        )}
        {renderControl()}
        {(error || helperText) && (
          <p className={cn('mt-1 text-sm', error ? 'text-danger-600' : 'text-gray-500')}>
            {error || helperText}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';

import React from 'react';
import { cn } from './utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  /** When true, renders only the bare textarea (no wrapper/label/helper). */
  bare?: boolean;
}

const textareaClasses = (error?: string) =>
  cn(
    'flex min-h-[80px] w-full rounded-lg border bg-white px-3 py-2 text-sm transition-colors',
    'placeholder:text-gray-400',
    'focus:outline-none focus:ring-2 focus:ring-offset-1',
    error
      ? 'border-danger-500 focus:border-danger-500 focus:ring-danger-200'
      : 'border-gray-300 focus:border-primary-500 focus:ring-primary-200',
    'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-gray-50',
  );

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, helperText, bare, id, ...props }, ref) => {
    const textareaId = id || label?.toLowerCase().replace(/\s+/g, '-');

    if (bare || (!label && !error && !helperText)) {
      return (
        <textarea
          id={textareaId}
          className={cn(textareaClasses(error), className)}
          ref={ref}
          {...props}
        />
      );
    }

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={textareaId}
            className="mb-1.5 block text-sm font-medium text-gray-700"
          >
            {label}
          </label>
        )}
        <textarea
          id={textareaId}
          className={cn(textareaClasses(error), className)}
          ref={ref}
          {...props}
        />
        {(error || helperText) && (
          <p className={cn('mt-1 text-sm', error ? 'text-danger-600' : 'text-gray-500')}>
            {error || helperText}
          </p>
        )}
      </div>
    );
  },
);

Textarea.displayName = 'Textarea';

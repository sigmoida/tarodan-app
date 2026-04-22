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
    'flex min-h-[80px] w-full rounded-lg border bg-surface-elevated px-3 py-2 text-sm text-body transition-colors',
    'placeholder:text-subtle',
    'focus:outline-none focus:ring-2 focus:ring-offset-1',
    error
      ? 'border-danger-500 focus:border-danger-500 focus:ring-danger-200'
      : 'border-border focus:border-primary-500 focus:ring-primary-200',
    'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-surface',
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
            className="mb-1.5 block text-sm font-medium text-body"
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
          <p className={cn('mt-1 text-sm', error ? 'text-danger-600' : 'text-muted')}>
            {error || helperText}
          </p>
        )}
      </div>
    );
  },
);

Textarea.displayName = 'Textarea';

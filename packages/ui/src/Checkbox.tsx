import React from 'react';
import { cn } from './utils';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  /** Optional label rendered to the right of the checkbox */
  label?: React.ReactNode;
  /** Error message shown below */
  error?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
};

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, error, size = 'md', id, ...props }, ref) => {
    const cbId = id || (typeof label === 'string' ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    const input = (
      <input
        ref={ref}
        type="checkbox"
        id={cbId}
        className={cn(
          'shrink-0 cursor-pointer rounded border-gray-300 text-primary-600',
          'focus:ring-2 focus:ring-primary-500 focus:ring-offset-1',
          'disabled:cursor-not-allowed disabled:opacity-50',
          sizeClasses[size],
          error && 'border-danger-500',
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
          className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700"
        >
          {input}
          <span>{label}</span>
        </label>
        {error && <p className="text-sm text-danger-600">{error}</p>}
      </div>
    );
  },
);

Checkbox.displayName = 'Checkbox';

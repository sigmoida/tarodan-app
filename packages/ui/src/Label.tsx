import React from 'react';
import { cn } from './utils';

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  /** Marks the associated field as required (appends a *). */
  required?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
};

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, required, size = 'md', children, ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={cn(
          'block font-medium text-body mb-1.5',
          sizeClasses[size],
          'peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
          className,
        )}
        {...props}
      >
        {children}
        {required && <span className="ml-0.5 text-danger-600" aria-hidden="true">*</span>}
      </label>
    );
  },
);

Label.displayName = 'Label';

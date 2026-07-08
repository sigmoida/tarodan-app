import React from 'react';
import { cn } from '../lib/utils';

export interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Size of the spinner */
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  /** Style variant: 'border' (CSS border circle) or 'svg' (SVG icon) */
  variant?: 'border' | 'svg';
  /** Color class for the spinner (e.g. 'text-primary-500', 'border-surface-elevated') */
  color?: string;
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
  xl: 'h-12 w-12',
  '2xl': 'h-16 w-16',
};

const borderWidthClasses = {
  sm: 'border-2',
  md: 'border-2',
  lg: 'border-2',
  xl: 'border-4',
  '2xl': 'border-4',
};

/**
 * Spinner — loading indicator.
 *
 * Default variant is 'border' (CSS border circle) matching the codebase's
 * predominant style. Use `variant="svg"` for the SVG-based spinner.
 *
 * Color is controlled via className or `color` prop:
 *   <Spinner className="text-primary-500" />        // svg variant uses text-current
 *   <Spinner variant="border" color="border-surface-elevated border-t-transparent" />
 *
 * For convenience, the default border variant uses primary-500.
 */
export const Spinner = React.forwardRef<HTMLDivElement, SpinnerProps>(
  ({ className, size = 'md', variant = 'border', color, ...props }, ref) => {
    if (variant === 'svg') {
      return (
        <div
          ref={ref}
          className={cn('animate-spin', sizeClasses[size], className)}
          {...props}
        >
          <svg
            className="h-full w-full text-current"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </div>
      );
    }

    // Border variant (default) — matches existing codebase pattern
    const defaultColor = 'border-primary-500 border-t-transparent';
    return (
      <div
        ref={ref}
        className={cn(
          'animate-spin rounded-full',
          sizeClasses[size],
          borderWidthClasses[size],
          color || defaultColor,
          className,
        )}
        role="status"
        aria-label="Loading"
        {...props}
      />
    );
  },
);

Spinner.displayName = 'Spinner';

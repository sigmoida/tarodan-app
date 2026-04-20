import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-gray-100 text-gray-800',
        primary: 'bg-primary-100 text-primary-800',
        secondary: 'bg-gray-100 text-gray-900',
        success: 'bg-green-100 text-green-800',
        warning: 'bg-yellow-100 text-yellow-800',
        danger: 'bg-red-100 text-red-800',
        destructive: 'bg-red-100 text-red-800',
        info: 'bg-blue-100 text-blue-800',
        outline: 'border border-current bg-transparent',
      },
      size: {
        sm: 'px-2 py-0.5 text-xs',
        md: 'px-2.5 py-0.5 text-sm',
        lg: 'px-3 py-1 text-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(badgeVariants({ variant, size, className }))}
        {...props}
      />
    );
  }
);

Badge.displayName = 'Badge';

export { badgeVariants };

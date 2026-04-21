import React from 'react';
import { cn } from './utils';

export type ProductBadgeVariant =
  | 'sale'
  | 'new'
  | 'rare'
  | 'preorder'
  | 'limited'
  | 'default';

export interface ProductBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: ProductBadgeVariant;
}

const variantClasses: Record<ProductBadgeVariant, string> = {
  sale: 'bg-danger-600 text-white',
  new: 'bg-success-600 text-white',
  rare: 'bg-primary-600 text-white',
  preorder: 'bg-info-600 text-white',
  limited: 'bg-warning-500 text-white',
  default: 'bg-gray-100 text-body border border-gray-200',
};

/**
 * Merchandising badge shown on product cards (e.g. sale/new/rare/preorder/limited).
 * Distinct from the generic status <Badge> — product-specific semantics.
 */
export const ProductBadge = React.forwardRef<HTMLSpanElement, ProductBadgeProps>(
  ({ variant = 'default', className, children, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-md',
          variantClasses[variant],
          className,
        )}
        {...props}
      >
        {children}
      </span>
    );
  },
);

ProductBadge.displayName = 'ProductBadge';

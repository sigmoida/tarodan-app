import React from 'react';
import { cn } from '../lib/utils';
import { Badge, type BadgeProps } from './Badge';

export type ProductBadgeVariant =
  | 'sale'
  | 'new'
  | 'trade'
  | 'rare'
  | 'preorder'
  | 'limited'
  | 'sponsored'
  | 'default';

export interface ProductBadgeProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  variant?: ProductBadgeVariant;
  children?: React.ReactNode;
  /** Optional leading icon (e.g. the trade arrows), before the label. */
  icon?: React.ReactNode;
}

/** Product variant → generic Badge variant + appearance. */
const TO_BADGE: Record<
  ProductBadgeVariant,
  { variant: NonNullable<BadgeProps['variant']>; appearance: NonNullable<BadgeProps['appearance']> }
> = {
  sale: { variant: 'danger', appearance: 'solid' },
  new: { variant: 'success', appearance: 'solid' },
  trade: { variant: 'success', appearance: 'solid' },
  rare: { variant: 'primary', appearance: 'solid' },
  preorder: { variant: 'info', appearance: 'solid' },
  limited: { variant: 'warning', appearance: 'solid' },
  sponsored: { variant: 'warning', appearance: 'solid' },
  default: { variant: 'default', appearance: 'soft' },
};

/**
 * Merchandising badge for product cards (sale / new / trade / rare / preorder /
 * limited / sponsored). A thin wrapper over the generic {@link Badge}: it maps
 * each product variant to a Badge variant + the SOLID appearance (bold, readable
 * over product imagery), so the merchandising look lives in one place instead of
 * a forked `<span>`.
 */
export const ProductBadge = React.forwardRef<HTMLSpanElement, ProductBadgeProps>(
  ({ variant = 'default', className, children, icon, ...props }, ref) => {
    const mapped = TO_BADGE[variant];
    return (
      <Badge
        ref={ref}
        variant={mapped.variant}
        appearance={mapped.appearance}
        size="sm"
        icon={icon}
        className={cn(
          'rounded-md font-bold',
          variant === 'default' && 'border border-border',
          className,
        )}
        {...props}
      >
        {children}
      </Badge>
    );
  },
);

ProductBadge.displayName = 'ProductBadge';

import React from 'react';
import { Badge, type BadgeProps } from './Badge';
import type { StatusConfig } from '../lib/status-configs';
import { cn } from '../lib/utils';

export interface StatusBadgeProps extends Omit<BadgeProps, 'variant'> {
  /** The status string (e.g. 'pending_payment', 'completed') */
  status: string;
  /** Status → label+variant mapping. Use pre-built configs from status-configs.ts or provide your own. */
  config: Record<string, StatusConfig>;
  /** Override the label from config */
  label?: string;
}

export const StatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ status, config, label, size, className, ...props }, ref) => {
    const entry = config[status];

    if (!entry) {
      return (
        <Badge ref={ref} variant="default" size={size} className={cn(className)} {...props}>
          {label || status}
        </Badge>
      );
    }

    return (
      <Badge ref={ref} variant={entry.variant} size={size} className={cn(className)} {...props}>
        {label || entry.label}
      </Badge>
    );
  }
);

StatusBadge.displayName = 'StatusBadge';

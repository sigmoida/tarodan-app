import React from 'react';
import { Badge, type BadgeProps } from './Badge';
import type { StatusConfig } from '../lib/status-configs';

export interface StatusBadgeProps extends Omit<BadgeProps, 'variant' | 'active'> {
  /** The status string (e.g. 'pending_payment', 'completed') */
  status: string;
  /** Status → label+variant mapping. Use pre-built configs from status-configs.ts or provide your own. */
  config: Record<string, StatusConfig>;
  /** Override the label from config */
  label?: React.ReactNode;
}

/**
 * Thin alias of {@link Badge}'s config-driven mode, kept for the many existing
 * `<StatusBadge status config />` call sites. New code can use `<Badge status
 * config />` directly.
 */
export const StatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ status, config, label, ...props }, ref) => (
    <Badge ref={ref} status={status} config={config} label={label} {...props} />
  ),
);

StatusBadge.displayName = 'StatusBadge';

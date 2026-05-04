import React from 'react';
import { Badge, type BadgeVariant } from './Badge';

export interface StatusBadgeProps {
  status: string;
  config: Record<string, { label: string; variant: BadgeVariant }>;
  fallbackVariant?: BadgeVariant;
  size?: 'sm' | 'md' | 'lg';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  config,
  fallbackVariant = 'default',
  size = 'md',
}) => {
  const cfg = config[status];
  return (
    <Badge variant={cfg?.variant ?? fallbackVariant} size={size}>
      {cfg?.label ?? status}
    </Badge>
  );
};

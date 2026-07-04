/** @format */

import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';
import type { StatusConfig } from '../lib/status-configs';

const badgeVariants = cva(
	'inline-flex items-center whitespace-nowrap rounded-lg font-semibold transition-colors',
	{
		variants: {
			variant: {
				default: 'bg-surface-alt text-body',
				primary: 'bg-primary-100 text-primary-800',
				secondary: 'bg-surface-alt text-heading',
				success: 'bg-success-100 text-success-800',
				warning: 'bg-warning-100 text-warning-800',
				danger: 'bg-danger-100 text-danger-800',
				destructive: 'bg-danger-100 text-danger-800',
				info: 'bg-info-100 text-info-800',
				outline: 'border border-current bg-transparent',
			},
			size: {
				sm: 'px-2 py-0.5 text-xs',
				md: 'px-2.5 py-1 text-sm',
				lg: 'px-3 py-2 text-sm',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'md',
		},
	},
);

export interface BadgeProps
	extends
		Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'>,
		VariantProps<typeof badgeVariants> {
	children?: React.ReactNode;
	/**
	 * Config-driven mode: a status key looked up in `config` for its label +
	 * variant. Subsumes the former `StatusBadge`.
	 */
	status?: string;
	config?: Record<string, StatusConfig>;
	/** Override the resolved label (from config or the active/passive preset). */
	label?: React.ReactNode;
	/**
	 * Active/passive preset: renders a success/muted "Aktif"/"Pasif" badge.
	 * Subsumes the former `ActiveBadge`. Takes precedence over `status`/`config`.
	 */
	active?: boolean;
	activeLabel?: React.ReactNode;
	passiveLabel?: React.ReactNode;
}

/**
 * The single badge primitive. Three interchangeable modes:
 *  - plain:   `<Badge variant="success">Metin</Badge>`
 *  - status:  `<Badge status={x} config={cfg} />`   (config → label + variant)
 *  - active:  `<Badge active={isActive} />`          (Aktif / Pasif)
 */
export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
	(
		{
			className,
			variant,
			size,
			status,
			config,
			label,
			active,
			activeLabel = 'Aktif',
			passiveLabel = 'Pasif',
			children,
			...props
		},
		ref,
	) => {
		let resolvedVariant = variant ?? undefined;
		let content: React.ReactNode = children;

		if (active !== undefined) {
			resolvedVariant = variant ?? (active ? 'success' : 'default');
			content = label ?? (active ? activeLabel : passiveLabel);
		} else if (status !== undefined && config) {
			const entry = config[status];
			resolvedVariant = variant ?? entry?.variant ?? 'default';
			content = label ?? entry?.label ?? status;
		} else if (label !== undefined) {
			content = label;
		}

		return (
			<span
				ref={ref}
				className={cn(
					badgeVariants({ variant: resolvedVariant, size, className }),
				)}
				{...props}>
				{content}
			</span>
		);
	},
);

Badge.displayName = 'Badge';

export { badgeVariants };

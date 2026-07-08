import type { ReactNode } from 'react';

/**
 * The single "no data yet" card for the web app (profile area and anywhere a
 * data list can come back empty). A bordered, centered card with a title, an
 * optional subtitle and an optional action button — deliberately ICON-LESS, so
 * every empty state reads the same. Each route passes its own copy + CTA
 * (colocated, i18n-friendly); the layout lives here once instead of being
 * hand-rolled per page. Need an icon for a special case? Use `@tarodan/ui`'s
 * `EmptyState` instead — this card is the plain, uniform default.
 */
export function EmptyStateCard({
	title,
	description,
	action,
	className,
}: {
	title: string;
	description?: ReactNode;
	action?: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={`rounded-lg border border-border bg-surface-elevated px-4 py-16 text-center ${
				className ?? ''
			}`}>
			<h3 className='text-xl font-semibold text-heading'>{title}</h3>
			{description && <p className='mx-auto mt-2 max-w-md text-muted'>{description}</p>}
			{action && <div className='mt-6'>{action}</div>}
		</div>
	);
}

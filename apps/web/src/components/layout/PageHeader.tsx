/** @format */

import type { ReactNode } from 'react';

/**
 * The single page-header band for marketplace list pages (listings, collections,
 * …) and detail pages. One consistent frame: an optional `breadcrumb` row on top,
 * the accent bar + title, an optional description, and an optional right-side
 * `actions` slot (create button, sort/layout controls, …). Mirrors the admin
 * `PageHeader` so every page's header band is built — and spaced — the same way.
 *
 * `title` is optional: a detail page can render this band with only a
 * `breadcrumb`, so its top zone occupies the same footprint (same left edge, same
 * bottom rhythm via `PageShell`'s `space-y`) as a list page's titled header.
 */
export function PageHeader({
	breadcrumb,
	title,
	description,
	actions,
}: {
	breadcrumb?: ReactNode;
	title?: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
}) {
	const hasRow = title || description || actions;

	return (
		<div className='flex flex-col gap-2 py-2'>
			{breadcrumb}
			{hasRow && (
				<div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
					<div className='min-w-0'>
						{title && (
							<h1 className='flex items-center gap-2 text-2xl font-bold text-heading'>
								<span className='h-6 w-1 flex-shrink-0 rounded-sm bg-primary-500' />
								<span className='truncate'>{title}</span>
							</h1>
						)}
						{description && (
							<p className='mt-0.5 text-sm text-muted'>{description}</p>
						)}
					</div>
					{actions && (
						<div className='flex flex-shrink-0 items-center gap-2'>
							{actions}
						</div>
					)}
				</div>
			)}
		</div>
	);
}

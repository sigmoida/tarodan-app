/** @format */

import type { ReactNode } from 'react';
import { Container } from './Container';

/**
 * The single page-header band for marketplace list pages (listings, collections,
 * …). One consistent frame: the accent bar + title, an optional description, and
 * an optional right-side `actions` slot (create button, sort/layout controls, …).
 * Mirrors the admin `PageHeader` so every page's header is built the same way.
 */
export function PageHeader({
	title,
	description,
	actions,
}: {
	title: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
}) {
	return (
		<div className='bg-surface'>
			<Container className='p-4'>
				<div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
					<div className='min-w-0'>
						<h1 className='flex items-center gap-2 text-2xl font-bold text-heading'>
							<span className='h-6 w-1 flex-shrink-0 rounded-sm bg-primary-500' />
							<span className='truncate'>{title}</span>
						</h1>
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
			</Container>
		</div>
	);
}

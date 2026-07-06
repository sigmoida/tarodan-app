/** @format */

import type { ReactNode } from 'react';

/**
 * The single carded frame used across the app — one consistent surface + border
 * + radius + padding, with one optional header: an accent bar + title, an
 * optional `badge` next to the title, and an optional right-aligned `action`
 * (a button/link). Sections supply only their header bits and content.
 *
 * Padding defaults to `p-3 md:p-5`; pass any `p-*` utility in `className` to
 * override it (the default is dropped when a padding utility is detected).
 */
export interface SectionCardProps {
	/** Header title. When omitted the accent bar is hidden too. */
	title?: ReactNode;
	/** Optional element rendered next to the title (e.g. a count Badge). */
	badge?: ReactNode;
	/** Optional right-aligned header slot — typically a button or link. */
	action?: ReactNode;
	children: ReactNode;
	/** Extra classes on the card container (padding here overrides the default). */
	className?: string;
	/** When set, wraps `children` in a div with these classes. */
	bodyClassName?: string;
	headerClassName?: string;
}

const PADDING_RE = /(?:^|\s)-?p[xytblrse]?-/;

export default function SectionCard({
	title,
	badge,
	action,
	children,
	className = '',
	bodyClassName,
	headerClassName = '',
}: SectionCardProps) {
	const hasHeader = title != null || action != null || badge != null;
	const defaultPad = PADDING_RE.test(className) ? '' : 'p-3 md:p-5';
	const containerClass =
		`bg-surface-elevated border border-border rounded-md ${defaultPad} ${className}`
			.replace(/\s+/g, ' ')
			.trim();

	return (
		<div className={containerClass}>
			{hasHeader && (
				<div
					className={`flex items-center justify-between gap-4 mb-4 ${headerClassName}`.trim()}>
					<div className='flex items-center gap-3 min-w-0'>
						{title != null && (
							<div className='w-1 h-6 bg-primary-500 flex-shrink-0 rounded-sm' />
						)}
						{title != null && (
							<h2 className='text-2xl font-bold text-heading tracking-tight truncate'>
								{title}
							</h2>
						)}
						{badge}
					</div>
					{action && <div className='flex-shrink-0'>{action}</div>}
				</div>
			)}
			{bodyClassName ? (
				<div className={bodyClassName}>{children}</div>
			) : (
				children
			)}
		</div>
	);
}

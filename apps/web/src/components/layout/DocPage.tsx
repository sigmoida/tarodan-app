/** @format */

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import { PageShell } from './PageShell';
import { PageHeader } from './PageHeader';

export interface DocBreadcrumbItem {
	label: ReactNode;
	href?: string;
}

/**
 * The shared frame for content / support / legal pages: `PageShell` + a
 * `PageHeader` carrying a "Ana Sayfa → …" breadcrumb and the accent-bar title
 * (optionally a description + actions). The body — SectionCards, prose, a form —
 * is supplied as children, mirroring the listings/collections refactor pattern.
 *
 * Kept barrel-free (inline breadcrumb, no `@tarodan/ui` import) so it stays a
 * Server Component — importing the UI barrel here would drag client primitives
 * (Input's `useState`, …) into the server graph. Works in Client pages too.
 */
export function DocPage({
	title,
	description,
	trail,
	actions,
	children,
}: {
	title: string;
	description?: ReactNode;
	/** Breadcrumb items after "Ana Sayfa" (defaults to just the current title). */
	trail?: DocBreadcrumbItem[];
	actions?: ReactNode;
	children: ReactNode;
}) {
	const items: DocBreadcrumbItem[] = [
		{ label: 'Ana Sayfa', href: '/' },
		...(trail ?? [{ label: title }]),
	];

	return (
		<PageShell>
			<PageHeader
				title={title}
				description={description}
				actions={actions}
			/>
			{children}
		</PageShell>
	);
}

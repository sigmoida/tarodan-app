/** @format */

import { type ReactNode } from 'react';
import { cn } from '@tarodan/ui';

/**
 * The single admin page wrapper — one source of truth for vertical page rhythm.
 * Every page body (and the ResourceList root) renders through this, so changing
 * the spacing here changes it everywhere. Never hardcode `space-y-6` on a page.
 */
export function AdminPage({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return <div className={cn('space-y-4', className)}>{children}</div>;
}

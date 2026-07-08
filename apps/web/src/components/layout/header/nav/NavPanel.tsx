/** @format */

import type { ReactNode } from 'react';

/**
 * Shared dropdown card shell for the header nav mega-panels (categories, scales).
 * One source of truth for the panel surface + border + radius + padding so both
 * panels stay identical.
 */
export default function NavPanel({ children }: { children: ReactNode }) {
	return (
		<div className='w-full p-4 bg-surface-elevated border border-border rounded-lg shadow-elevated'>
			{children}
		</div>
	);
}

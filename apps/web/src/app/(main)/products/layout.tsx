/** @format */

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/server/session';

/**
 * Auth gate for the `/products/*` area. `middleware.ts` bounces cookieless guests
 * at the edge; this verifies the session against the API before rendering. Not
 * indexable (behind auth).
 */
export const metadata: Metadata = {
	robots: { index: false, follow: false },
};

export default async function ProductsLayout({ children }: { children: ReactNode }) {
	const session = await getSession();
	if (!session) redirect('/login?redirect=/products');
	return <>{children}</>;
}

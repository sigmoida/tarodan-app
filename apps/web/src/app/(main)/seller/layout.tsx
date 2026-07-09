/** @format */

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/server/session';

/**
 * Authoritative auth gate for the whole seller area. `middleware.ts` bounces
 * cookieless guests at the edge; this verifies the session against the API
 * (catching a present-but-expired cookie) before rendering any `/seller/*` route.
 * The seller area is behind auth, so it is not indexable.
 */
export const metadata: Metadata = {
	robots: { index: false, follow: false },
};

export default async function SellerLayout({ children }: { children: ReactNode }) {
	const session = await getSession();
	if (!session) redirect('/login?redirect=/seller');
	return <>{children}</>;
}

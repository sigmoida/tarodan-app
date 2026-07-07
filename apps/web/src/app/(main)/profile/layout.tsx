/** @format */

import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/server/session';
import ProfileShell from './_components/ProfileShell';

/**
 * Server shell + authoritative auth gate for the account area. `middleware.ts`
 * already bounces cookieless guests at the edge; this verifies the session
 * against the API (catching a present-but-expired cookie) before rendering any
 * `/profile/*` route, then renders the client `ProfileShell` (sticky account
 * nav + main column). Metadata (title / robots noindex) stays per-page.
 */
export default async function ProfileLayout({ children }: { children: ReactNode }) {
	const session = await getSession();
	if (!session) redirect('/login?redirect=/profile');

	return <ProfileShell>{children}</ProfileShell>;
}

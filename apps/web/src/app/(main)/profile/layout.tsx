/** @format */

import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { getSession } from '@/lib/server/session';
import { getServerQueryClient } from '@/lib/query/server';
import { queryKeys } from '@/lib/query/keys';
import ProfileShell from './_components/ProfileShell';
import { buildOverviewSeed } from './_lib/overview-seed';

/**
 * Server shell + authoritative auth gate for the account area. `middleware.ts`
 * already bounces cookieless guests at the edge; this verifies the session
 * against the API (catching a present-but-expired cookie) before rendering any
 * `/profile/*` route, then renders the client `ProfileShell` (sticky account
 * nav + main column). Metadata (title / robots noindex) stays per-page.
 *
 * It also seeds the profile overview query from the verified session so the
 * dashboard header (name / avatar / tier) ships in the first HTML instead of
 * flashing a placeholder. The seed is marked stale (`dataUpdatedAt = 0`) so the
 * client refetches the full 8-call aggregate once on mount to fill the stats /
 * pending counts — SSR identity, client stats, no double-paint.
 */
export default async function ProfileLayout({ children }: { children: ReactNode }) {
	const session = await getSession();
	if (!session) redirect('/login?redirect=/profile');

	const queryClient = getServerQueryClient();
	queryClient.setQueryData(queryKeys.profile.overview(), buildOverviewSeed(session));
	const seeded = queryClient.getQueryCache().find({ queryKey: queryKeys.profile.overview() });
	if (seeded) seeded.state.dataUpdatedAt = 0;

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<ProfileShell>{children}</ProfileShell>
		</HydrationBoundary>
	);
}

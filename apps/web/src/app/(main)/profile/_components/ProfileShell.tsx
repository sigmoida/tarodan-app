/** @format */

'use client';

import type { ReactNode } from 'react';
import { ProfileProvider } from '../_context/ProfileContext';
import ProfileSidebar from './ProfileSidebar';

/**
 * The `/profile/*` two-column frame: a sticky account nav on the left (the
 * standing counterpart to the header account popover) and the routed page in
 * the main column. Owns the single `ProfileProvider` so the sidebar and every
 * child page share one profile-overview query. Below `lg` the sidebar collapses
 * — the header popover covers navigation there.
 */
export default function ProfileShell({ children }: { children: ReactNode }) {
	return (
		<ProfileProvider>
			<div className='flex flex-col gap-6 lg:flex-row'>
				<aside className='hidden lg:block lg:w-64 lg:flex-shrink-0'>
					<div className='lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto'>
						<ProfileSidebar />
					</div>
				</aside>
				<div className='min-w-0 flex-1'>{children}</div>
			</div>
		</ProfileProvider>
	);
}

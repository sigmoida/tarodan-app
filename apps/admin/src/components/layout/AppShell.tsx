/** @format */

'use client';

import { useIdleLogout } from '@/hooks/useIdleLogout';
import { useRouteGuard } from '@/hooks/useRouteGuard';
import { useSidebar } from '@/hooks/useSidebar';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

/**
 * The authenticated app chrome: sidebar + top bar + page content. Thin
 * composition — all state lives in hooks, all rendering in child components.
 * Session and permissions are provided by the (admin) server layout above.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
	// 1 saat hareketsizlikte otomatik logout (Balanced politika).
	useIdleLogout();
	// Route guard (UX) — izinler sunucudan otoriter geldiği için anlık ve yarışsız.
	useRouteGuard();

	const { open, openSidebar, closeSidebar } = useSidebar();

	return (
		<div className='min-h-screen bg-surface'>
			{open && (
				<div
					className='fixed inset-0 z-40 bg-heading/30 lg:hidden'
					onClick={closeSidebar}
				/>
			)}

			<Sidebar
				open={open}
				onClose={closeSidebar}
			/>

			{/* pt-16 clears the fixed h-16 Topbar (which is out of flow). */}
			<div className='pt-16 lg:pl-64'>
				<Topbar onOpenSidebar={openSidebar} />
				<main className='p-6'>{children}</main>
			</div>
		</div>
	);
}

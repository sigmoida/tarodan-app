/** @format */

import QueryProvider from './QueryProvider';
import { RealtimeProvider } from '@/components/realtime/RealtimeProvider';
import { PlatformFeeAnnouncementBanner } from '@/components/banners/PlatformFeeAnnouncementBanner';
import { ConfirmProvider } from '@/components/ConfirmProvider';
import BusinessMembershipGuard from '@/components/BusinessMembershipGuard';
import Navbar from '@/components/layout/Navbar';
import CategoryNavBarWrapper from '@/components/layout/CategoryNavBarWrapper';
import Footer from '@/components/layout/Footer';

/**
 * Layout for the public marketplace. Owns the storefront chrome (Navbar +
 * category bar + Footer) and the client providers those routes need
 * (query / realtime / confirm / business-membership gating + the platform-fee
 * banner). Auth pages and standalone status pages live outside this group and
 * so render without any of it. Replaces the old runtime `LayoutShell` path check.
 */
export default function MainLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<QueryProvider>
			<RealtimeProvider />
			<PlatformFeeAnnouncementBanner />
			<ConfirmProvider>
				<BusinessMembershipGuard>
					<Navbar />
					<CategoryNavBarWrapper />
					<main className='flex-1 w-full bg-surface'>
						{/* Content container: full-bleed until 2xl (1536px), then fixed +
                centered so it never stretches on ultra-wide screens. */}
						<div className='mx-auto w-full max-w-screen-2xl'>{children}</div>
					</main>
					<Footer />
				</BusinessMembershipGuard>
			</ConfirmProvider>
		</QueryProvider>
	);
}

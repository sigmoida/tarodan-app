/** @format */

'use client';

import { Button, Spinner } from '@tarodan/ui';
import { PageShell } from '@/components/layout/PageShell';
import { Container } from '@/components/layout/Container';
import { useTranslation } from '@/i18n';
import { ProfileProvider, useProfile } from './_context/ProfileContext';
import ProfileHero from './_components/ProfileHero';
import ProfileQuickStats from './_components/ProfileQuickStats';
import MembershipCard from './_components/MembershipCard';
import ProfileMenu from './_components/ProfileMenu';

function HeaderSpinner() {
	return (
		<div className='flex justify-center py-12'>
			<Spinner size='xl' color='border-surface-elevated border-t-transparent' />
		</div>
	);
}

function ProfileLayout() {
	const { t } = useTranslation();
	const { mounted, authLoading, isAuthenticated, isLoadingProfile, handleLogout } =
		useProfile();

	// Pre-auth / redirecting state.
	if (!mounted || authLoading || !isAuthenticated) {
		return (
			<PageShell>
				<div className='bg-primary-500 pt-8 pb-24'>
					<Container className='px-4'>
						<HeaderSpinner />
					</Container>
				</div>
				<Container className='px-4 -mt-16'>
					<div className='grid grid-cols-2 md:grid-cols-4 gap-4 mb-6'>
						{[1, 2, 3, 4].map((i) => (
							<div
								key={i}
								className='bg-surface-elevated rounded p-5 shadow-sm border border-border-subtle animate-pulse'>
								<div className='h-12 bg-border-subtle rounded' />
							</div>
						))}
					</div>
				</Container>
			</PageShell>
		);
	}

	return (
		<PageShell>
			{/* Hero banner */}
			<div className='bg-primary-500 pt-8 pb-24'>
				<Container className='px-4'>
					{isLoadingProfile ? <HeaderSpinner /> : <ProfileHero />}
				</Container>
			</div>

			{/* Content (pulled up over the banner) */}
			<Container className='px-4 -mt-16 pb-8'>
				<ProfileQuickStats />
				<MembershipCard />

				<div className='space-y-6'>
					<ProfileMenu />

					<Button
						variant='secondary'
						onClick={handleLogout}
						className='w-full py-4 bg-surface-elevated border border-danger-200 text-danger-600 font-medium rounded hover:bg-danger-50 transition-colors shadow-sm'>
						{t('common.logout')}
					</Button>
				</div>
			</Container>
		</PageShell>
	);
}

export default function ProfileClient() {
	return (
		<ProfileProvider>
			<ProfileLayout />
		</ProfileProvider>
	);
}

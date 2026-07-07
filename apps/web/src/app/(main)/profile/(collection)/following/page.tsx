'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { UserIcon } from '@heroicons/react/24/outline';
import { Button, Spinner } from '@tarodan/ui';
import { PageShell } from '@/components/layout/PageShell';
import { PageHeader } from '@/components/layout/PageHeader';
import AuthLoadingScreen from '@/components/AuthLoadingScreen';
import { useAuthStore } from '@/stores/authStore';
import { useFollowing, useUnfollow } from './_hooks/useFollowing';
import FollowedSellerCard from './_components/FollowedSellerCard';

export default function FollowingPage() {
	const router = useRouter();
	const { isAuthenticated, isLoading: authLoading } = useAuthStore();

	useEffect(() => {
		if (authLoading) return;
		if (!isAuthenticated) router.push('/login?redirect=/profile/following');
	}, [authLoading, isAuthenticated, router]);

	const enabled = !authLoading && isAuthenticated;
	const { following, isLoading } = useFollowing(enabled);
	const unfollow = useUnfollow();

	if (authLoading) return <AuthLoadingScreen />;
	if (!isAuthenticated) return null;

	return (
		<PageShell className='pb-16'>
			<PageHeader
				title='Takip Ettiklerim'
				description={`${following.length} satıcı takip ediliyor`}
			/>

			{isLoading ? (
				<div className='flex justify-center py-12'>
					<Spinner size='xl' />
				</div>
			) : following.length === 0 ? (
				<div className='rounded-lg border border-border bg-surface-elevated py-16 text-center'>
					<div className='mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-lg bg-surface-alt'>
						<UserIcon className='h-8 w-8 text-subtle' />
					</div>
					<h2 className='mb-2 text-xl font-semibold text-heading'>
						Henüz kimseyi takip etmiyorsunuz
					</h2>
					<p className='mb-6 text-muted'>
						Satıcıları takip ederek yeni ilanlarından haberdar olun
					</p>
					<Button asChild>
						<Link href='/listings'>İlanları Keşfet</Link>
					</Button>
				</div>
			) : (
				<div className='grid gap-4'>
					{following.map((item) => (
						<FollowedSellerCard
							key={item.id}
							item={item}
							busy={unfollow.isPending && unfollow.variables === item.following.id}
							onUnfollow={(userId) => unfollow.mutate(userId)}
						/>
					))}
				</div>
			)}
		</PageShell>
	);
}

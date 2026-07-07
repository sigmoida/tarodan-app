'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { Button } from '@tarodan/ui';
import { PageShell } from '@/components/layout/PageShell';
import { PageHeader } from '@/components/layout/PageHeader';
import AuthLoadingScreen from '@/components/AuthLoadingScreen';
import { useAuthStore } from '@/stores/authStore';
import { useSavedSearches } from './_hooks/useSavedSearches';
import SavedSearchCard from './_components/SavedSearchCard';

export default function SavedSearchesPage() {
	const router = useRouter();
	const { isAuthenticated, isLoading: authLoading, user } = useAuthStore();

	useEffect(() => {
		if (authLoading) return;
		if (!isAuthenticated) router.push('/login?redirect=/profile/saved-searches');
	}, [authLoading, isAuthenticated, router]);

	const enabled = !authLoading && isAuthenticated;
	const { savedSearches, isLoading, remove, toggleNotify, runSearch } = useSavedSearches(enabled);

	const searchLimit =
		user?.membershipTier === 'free'
			? 5
			: user?.membershipTier === 'basic'
				? 10
				: user?.membershipTier === 'premium'
					? 20
					: 50;

	if (authLoading) return <AuthLoadingScreen />;
	if (!isAuthenticated) return null;

	if (isLoading) {
		return (
			<PageShell className='pb-16'>
				<div className='animate-pulse space-y-4'>
					<div className='h-8 w-1/3 rounded bg-border-subtle' />
					{[...Array(3)].map((_, i) => (
						<div key={i} className='h-24 rounded-lg bg-border-subtle' />
					))}
				</div>
			</PageShell>
		);
	}

	return (
		<PageShell className='pb-16'>
			<PageHeader
				title='Kayıtlı Aramalarım'
				description='Kayıtlı aramalarınızı buradan yönetebilir, bildirim tercihlerini değiştirebilirsiniz.'
				actions={
					<span className='text-sm text-muted'>
						{savedSearches.length} / {searchLimit} arama
					</span>
				}
			/>

			<div className='rounded-lg border border-info-200 bg-info-50 p-4'>
				<p className='text-sm text-info-800'>
					<strong>İpucu:</strong> Arama yaparken sonuç sayfasında &quot;Bu aramayı kaydet&quot;
					butonunu kullanarak yeni arama ekleyebilirsiniz.
				</p>
			</div>

			{savedSearches.length === 0 ? (
				<div className='rounded-lg border border-border bg-surface-elevated p-12 text-center'>
					<MagnifyingGlassIcon className='mx-auto mb-4 h-16 w-16 text-border-strong' />
					<h2 className='mb-2 text-xl font-semibold text-heading'>Kayıtlı Arama Yok</h2>
					<p className='mb-6 text-muted'>
						Henüz kayıtlı aramanız bulunmuyor. İlanları ararken &quot;Bu aramayı kaydet&quot;
						butonunu kullanın.
					</p>
					<Button asChild className='gap-2'>
						<Link href='/listings'>
							<MagnifyingGlassIcon className='h-5 w-5' />
							İlan Ara
						</Link>
					</Button>
				</div>
			) : (
				<div className='space-y-4'>
					{savedSearches.map((search) => (
						<SavedSearchCard
							key={search.id}
							search={search}
							onToggleNotify={toggleNotify}
							onDelete={remove}
							onRun={runSearch}
						/>
					))}
				</div>
			)}

			{savedSearches.length >= searchLimit && (
				<div className='rounded-lg border border-warning-200 bg-warning-50 p-4'>
					<p className='text-sm text-warning-800'>
						Kayıtlı arama limitinize ulaştınız ({searchLimit} arama).{' '}
						{user?.membershipTier === 'free' && (
							<Link href='/pricing' className='font-medium underline'>
								Premium üyelikle daha fazla arama kaydedin →
							</Link>
						)}
					</p>
				</div>
			)}
		</PageShell>
	);
}

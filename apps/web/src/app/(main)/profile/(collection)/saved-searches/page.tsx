'use client';

import Link from 'next/link';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { Button } from '@tarodan/ui';
import { PageShell } from '@/components/layout/PageShell';
import { PageHeader } from '@/components/layout/PageHeader';
import AuthLoadingScreen from '@/components/AuthLoadingScreen';
import { EmptyStateCard } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useRequireAuth } from '../../_hooks/useRequireAuth';
import { useSavedSearches } from './_hooks/useSavedSearches';
import SavedSearchCard from './_components/SavedSearchCard';

export default function SavedSearchesPage() {
	const { ready } = useRequireAuth();
	const user = useAuthStore((s) => s.user);

	const { savedSearches, isLoading, remove, toggleNotify, runSearch } = useSavedSearches(ready);

	const searchLimit =
		user?.membershipTier === 'free'
			? 5
			: user?.membershipTier === 'basic'
				? 10
				: user?.membershipTier === 'premium'
					? 20
					: 50;

	if (!ready) return <AuthLoadingScreen />;

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

			{savedSearches.length === 0 ? (
				<EmptyStateCard
					title='Kayıtlı Arama Yok'
					description='İlanları ararken sonuç sayfasındaki "Bu aramayı kaydet" butonuyla aramanı kaydet; buradan yönetip yeni sonuçlarda bildirim alabilirsin.'
					action={
						<Button asChild className='gap-2'>
							<Link href='/listings'>
								<MagnifyingGlassIcon className='h-5 w-5' />
								İlan Ara
							</Link>
						</Button>
					}
				/>
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
							<Link href='/membership' className='font-medium underline'>
								Premium üyelikle daha fazla arama kaydedin →
							</Link>
						)}
					</p>
				</div>
			)}
		</PageShell>
	);
}

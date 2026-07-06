/** @format */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useTranslation } from '@/i18n';
import { PageShell } from '@/components/layout/PageShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { useFavorites } from './_hooks/useFavorites';
import FavoritesGrid from './_components/FavoritesGrid';
import ShareFavoritesButton from './_components/ShareFavoritesButton';

function FavoritesSkeleton() {
	return (
		<div className='grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4'>
			{[...Array(8)].map((_, i) => (
				<div
					key={i}
					className='h-40 rounded bg-border-subtle sm:h-64'
				/>
			))}
		</div>
	);
}

export default function FavoritesPage() {
	const router = useRouter();
	const { t, locale } = useTranslation();
	const [mounted, setMounted] = useState(false);
	useEffect(() => {
		setMounted(true);
	}, []);

	const {
		items,
		isLoading,
		isSharedView,
		isAuthenticated,
		authLoading,
		handleRemove,
		handleAddToCart,
	} = useFavorites();

	// Private favorites require auth; a shared (?ids=) view is public.
	useEffect(() => {
		if (!mounted || authLoading || isSharedView) return;
		if (!isAuthenticated) {
			toast.error(t('favorites.loginRequired'));
			router.push('/login?redirect=/profile/favorites');
		}
	}, [mounted, isAuthenticated, authLoading, isSharedView, router, t]);

	if (!isSharedView && (!mounted || authLoading || !isAuthenticated)) {
		return (
			<PageShell className='flex items-center justify-center'>
				<p className='animate-pulse text-sm text-muted'>
					{locale === 'en' ? 'Loading...' : 'Yükleniyor...'}
				</p>
			</PageShell>
		);
	}

	return (
		<PageShell>
			<PageHeader
				title={
					isSharedView ? t('favorites.sharedList') : t('favorites.myFavorites')
				}
				description={`${items.length} ${t('favorites.itemsInFavorites')}`}
				actions={
					!isSharedView && items.length > 0 ? (
						<ShareFavoritesButton productIds={items.map((i) => i.productId)} />
					) : undefined
				}
			/>

			{isLoading ? (
				<FavoritesSkeleton />
			) : (
				<FavoritesGrid
					items={items}
					isSharedView={isSharedView}
					onRemove={handleRemove}
					onAddToCart={handleAddToCart}
				/>
			)}
		</PageShell>
	);
}

/** @format */

'use client';

import { useLocale, useTranslations } from "next-intl";
import { PageShell } from '@/components/layout/PageShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { useRequireAuth } from '../../_hooks/useRequireAuth';
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
	const t = useTranslations();
  const locale = useLocale();
	const { ready } = useRequireAuth();

	const {
		items,
		isLoading,
		isSharedView,
		handleRemove,
		handleAddToCart,
	} = useFavorites();

	// Private favorites require auth; a shared (?ids=) view is public.
	if (!isSharedView && !ready) {
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

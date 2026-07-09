/** @format */

'use client';

import Link from 'next/link';
import { EyeIcon, HeartIcon } from '@heroicons/react/24/outline';
import { Spinner } from '@tarodan/ui';
import { EmptyStateCard } from '@/components/ui';
import OptimizedImage from '@/components/OptimizedImage';
import type { SellerCollection } from '../../_lib/types';

interface CollectionsTabProps {
	collections: SellerCollection[];
	loading: boolean;
	locale: string;
}

export default function CollectionsTab({ collections, loading, locale }: CollectionsTabProps) {
	const en = locale === 'en';

	if (loading) {
		return (
			<div className='flex justify-center py-16'>
				<Spinner size='lg' />
			</div>
		);
	}
	if (collections.length === 0) {
		return (
			<EmptyStateCard
				title={en ? 'No collections yet' : 'Henüz koleksiyon yok'}
				description={en ? 'This seller has no public collections.' : 'Bu satıcının herkese açık koleksiyonu yok.'}
			/>
		);
	}

	return (
		<div className='grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'>
			{collections.map((collection) => (
				<Link
					key={collection.id}
					href={`/collections/${collection.id}`}
					className='group block overflow-hidden rounded-xl border border-border-subtle bg-surface-elevated shadow-sm transition-shadow hover:shadow-lg'>
					<div className='relative aspect-[4/3] overflow-hidden bg-surface'>
						{collection.coverImageUrl ? (
							<OptimizedImage
								src={collection.coverImageUrl}
								alt={collection.name}
								fill
								className='object-cover transition-transform duration-500 group-hover:scale-105'
								fallbackSrc='https://placehold.co/400x300/f8fafc/94a3b8?text=Koleksiyon'
								logContext={{ collectionId: collection.id, page: 'seller-collections' }}
							/>
						) : (
							<div className='absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 text-4xl'>
								🚗
							</div>
						)}
					</div>
					<div className='p-3'>
						<h3 className='line-clamp-1 text-sm font-medium text-heading transition-colors group-hover:text-primary-600'>
							{collection.name}
						</h3>
						<div className='mt-2 flex items-center justify-between text-xs text-subtle'>
							<span className='font-medium'>
								{collection.itemCount ?? 0} {en ? 'items' : 'ürün'}
							</span>
							<div className='flex items-center gap-2'>
								<span className='flex items-center gap-0.5'>
									<EyeIcon className='h-3.5 w-3.5' />
									{collection.viewCount ?? 0}
								</span>
								<span className='flex items-center gap-0.5'>
									<HeartIcon className='h-3.5 w-3.5' />
									{collection.likeCount ?? 0}
								</span>
							</div>
						</div>
					</div>
				</Link>
			))}
		</div>
	);
}

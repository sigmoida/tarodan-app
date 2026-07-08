/** @format */

'use client';

import Link from 'next/link';
import { EyeIcon, HeartIcon } from '@heroicons/react/24/outline';
import { Badge } from '@tarodan/ui';
import OptimizedImage from '@/components/OptimizedImage';
import { useTranslation } from '@/i18n';
import type { Collection } from '../_lib/types';

export default function CollectionCard({ collection }: { collection: Collection }) {
	const { t, locale } = useTranslation();

	return (
		<Link
			href={`/collections/${collection.id}`}
			className='group block h-full overflow-hidden rounded-lg border border-border bg-surface-elevated transition-all hover:border-primary-300 hover:shadow-md'>
			<div className='relative aspect-[4/3] overflow-hidden bg-surface-alt'>
				{collection.coverImageUrl ? (
					<OptimizedImage
						src={collection.coverImageUrl}
						alt={collection.name}
						fill
						className='object-cover transition-transform duration-300 group-hover:scale-[1.03]'
						fallbackSrc='https://placehold.co/400x300/f3f4f6/9ca3af?text=Koleksiyon'
						logContext={{ collectionId: collection.id, page: 'my-collections' }}
					/>
				) : (
					<div className='absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 text-4xl'>
						🚗
					</div>
				)}
				<div className='absolute right-1.5 top-1.5'>
					<Badge variant={collection.isPublic ? 'success' : 'secondary'} size='sm'>
						{collection.isPublic ? t('collection.isPublic') : t('collection.isPrivate')}
					</Badge>
				</div>
			</div>
			<div className='p-2.5'>
				<h3 className='line-clamp-1 text-sm font-medium text-heading transition-colors group-hover:text-primary-600'>
					{collection.name}
				</h3>
				{collection.description && (
					<p className='mt-0.5 line-clamp-1 text-[10px] text-subtle'>{collection.description}</p>
				)}
				<div className='mt-2 flex items-center justify-between text-[10px] text-subtle'>
					<span className='font-medium'>
						{collection.itemCount} {locale === 'en' ? 'items' : 'ürün'}
					</span>
					<div className='flex items-center gap-2'>
						{collection.viewCount !== undefined && (
							<span className='flex items-center gap-0.5'>
								<EyeIcon className='h-3 w-3' />
								{collection.viewCount}
							</span>
						)}
						{collection.likeCount !== undefined && (
							<span className='flex items-center gap-0.5'>
								<HeartIcon className='h-3 w-3' />
								{collection.likeCount}
							</span>
						)}
					</div>
				</div>
			</div>
		</Link>
	);
}

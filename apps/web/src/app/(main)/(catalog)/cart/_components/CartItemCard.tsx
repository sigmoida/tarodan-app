/** @format */

'use client';

import Image from 'next/image';
import Link from 'next/link';
import { TrashIcon } from '@heroicons/react/24/outline';
import { IconButton } from '@tarodan/ui';
import { SectionCard } from '@/components/ui';
import { useTranslation } from '@/i18n';
import type { CartLineItem } from '../_lib/types';

const PLACEHOLDER = 'https://via.placeholder.com/96';

const fmtTL = (n: number) =>
	n.toLocaleString('tr-TR', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});

export default function CartItemCard({ item }: { item: CartLineItem }) {
	const { t, locale } = useTranslation();
	const href = `/listings/${item.productId}`;
	const hasDiscount =
		item.originalPrice != null && item.originalPrice > item.price;

	return (
		<SectionCard className='p-4 flex gap-4'>
			<Link href={href}>
				<div className='w-24 h-24 rounded-lg overflow-hidden bg-surface-alt flex-shrink-0'>
					<Image
						src={item.image || PLACEHOLDER}
						alt={item.title}
						width={96}
						height={96}
						className='object-cover w-full h-full'
					/>
				</div>
			</Link>
			<div className='flex-1'>
				<Link href={href}>
					<h3 className='font-semibold text-heading hover:text-primary-500 line-clamp-2'>
						{item.title}
					</h3>
				</Link>
				<p className='text-sm text-muted mt-1'>
					{t('product.seller')}: @{item.sellerName}
				</p>
				<div className='mt-2'>
					{hasDiscount && (
						<p className='text-sm text-subtle line-through'>
							{fmtTL(item.originalPrice ?? 0)} TL
						</p>
					)}
					<p className='text-lg font-bold text-primary-500'>
						{fmtTL(item.price)} TL
					</p>
				</div>
			</div>
			<IconButton
				variant='danger'
				size='sm'
				onClick={item.onRemove}
				className='self-start'
				aria-label={locale === 'en' ? 'Remove item' : 'Ürünü kaldır'}>
				<TrashIcon className='w-5 h-5' />
			</IconButton>
		</SectionCard>
	);
}

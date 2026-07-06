/** @format */

'use client';

import Link from 'next/link';
import { TagIcon } from '@heroicons/react/24/outline';
import { SectionCard } from '@/components/ui';
import { formatTL } from '@/lib/format';
import { useTranslation } from '@/i18n';
import { getProductInfo, orderAmountOf, type OrderDetail } from '../_lib/types';

export default function ProductInfoCard({ order }: { order: OrderDetail }) {
	const { locale } = useTranslation();
	const productInfo = getProductInfo(order);
	const productImage = productInfo?.imageUrl || order.items?.[0]?.product?.imageUrl;
	const orderAmount = orderAmountOf(order);

	return (
		<SectionCard title={locale === 'en' ? 'Product Information' : 'Ürün Bilgileri'}>
			<div className='flex gap-4'>
				<div className='w-24 h-24 bg-surface-alt rounded-lg overflow-hidden flex-shrink-0'>
					{productImage ? (
						<img
							src={productImage}
							alt={productInfo?.title || (locale === 'en' ? 'Product' : 'Ürün')}
							className='w-full h-full object-cover'
						/>
					) : (
						<div className='w-full h-full flex items-center justify-center bg-surface'>
							<TagIcon className='w-8 h-8 text-border-strong' />
						</div>
					)}
				</div>
				<div className='flex-1'>
					<Link
						href={`/listings/${productInfo?.id}`}
						className='text-lg font-medium text-heading hover:text-primary-500 transition-colors'>
						{productInfo?.title || (locale === 'en' ? 'Product' : 'Ürün')}
					</Link>
					<p className='text-sm text-muted mt-1'>
						{locale === 'en' ? 'Quantity: 1' : 'Adet: 1'}
					</p>
					<p className='text-xl font-bold text-primary-500 mt-2'>{formatTL(orderAmount)}</p>
				</div>
			</div>
		</SectionCard>
	);
}

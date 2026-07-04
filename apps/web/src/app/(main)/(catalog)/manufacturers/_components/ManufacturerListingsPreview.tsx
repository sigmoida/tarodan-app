/** @format */

'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import {
	getProductEffectivePrice,
	isProductOnSaleDisplay,
} from '@/lib/productPrice';
import { fetchManufacturerPreviewClient } from '../_lib/data';

const CONDITION_LABELS: Record<string, string> = {
	new: 'Sıfır',
	used: 'İkinci El',
	as_new: 'Yeni Gibi',
};

function previewImageUrl(img: any): string | null {
	if (!img) return null;
	if (typeof img === 'string') return img;
	return img.cardUrl ?? img.detailUrl ?? img.url ?? null;
}

/** The 4-item active-listing teaser rendered inside an expanded accordion card. */
export default function ManufacturerListingsPreview({
	manufacturerId,
}: {
	manufacturerId: string;
}) {
	const { data: listings = [], isLoading } = useQuery({
		queryKey: queryKeys.manufacturers.preview(manufacturerId),
		queryFn: () => fetchManufacturerPreviewClient(manufacturerId),
		staleTime: 60_000,
	});

	if (isLoading) {
		return (
			<div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
				{[1, 2, 3, 4].map((n) => (
					<div key={n} className='bg-surface rounded-lg h-40 animate-pulse' />
				))}
			</div>
		);
	}

	if (listings.length === 0) {
		return (
			<p className='text-sm text-muted py-2'>Bu üreticiye ait aktif ilan yok.</p>
		);
	}

	return (
		<div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
			{listings.map((product: any) => {
				const isSale = isProductOnSaleDisplay(product);
				const effectivePrice = getProductEffectivePrice(product);
				const imgUrl = previewImageUrl(product.images?.[0]);

				return (
					<Link
						key={product.id}
						href={`/listings/${product.id}`}
						className='group block bg-surface rounded-lg overflow-hidden border border-border hover:border-primary-300 hover:shadow-md transition-all duration-200'>
						<div className='aspect-square relative bg-surface-alt'>
							{imgUrl ? (
								<Image
									src={imgUrl}
									alt={product.title}
									fill
									className='object-cover group-hover:scale-105 transition-transform duration-300'
									sizes='200px'
									unoptimized
								/>
							) : (
								<div className='w-full h-full flex items-center justify-center text-subtle text-xs'>
									Görsel yok
								</div>
							)}
							{isSale && product.discountPercent && (
								<span className='absolute top-2 right-2 bg-danger-500 text-inverted text-[10px] font-black px-1.5 py-0.5 rounded'>
									%{product.discountPercent}
								</span>
							)}
						</div>
						<div className='p-2'>
							{product.condition && (
								<span className='text-[10px] font-semibold text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded-full'>
									{CONDITION_LABELS[product.condition] || product.condition}
								</span>
							)}
							<p className='text-xs font-semibold text-heading mt-1 line-clamp-2 leading-snug'>
								{product.title}
							</p>
							<p className='text-sm font-black text-heading mt-1'>
								₺{effectivePrice.toLocaleString('tr-TR')}
							</p>
						</div>
					</Link>
				);
			})}
		</div>
	);
}

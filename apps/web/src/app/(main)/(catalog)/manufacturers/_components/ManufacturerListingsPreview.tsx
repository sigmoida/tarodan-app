/** @format */

'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { ProductCard } from '@/components/ui';
import type { Product } from '@/types/product';
import { fetchManufacturerPreviewClient } from '../_lib/data';

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
			{listings.map((product: Product, index: number) => (
				<ProductCard
					key={product.id}
					product={product}
					index={index}
					showMeta={false}
				/>
			))}
		</div>
	);
}

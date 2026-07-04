/** @format */

'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { Spinner } from '@tarodan/ui';
import { queryKeys } from '@/lib/query/keys';
import { useTranslation } from '@/i18n';
import { PageShell } from '@/components/layout/PageShell';
import type { Product } from '@/types/product';
import {
	fetchManufacturerBySlugClient,
	fetchManufacturerProductsClient,
} from '../_lib/data';
import ManufacturerHero from './_components/ManufacturerHero';
import ManufacturerProductsGrid from './_components/ManufacturerProductsGrid';

export default function ManufacturerDetailClient() {
	const params = useParams();
	const slug = params?.slug as string;
	const { t } = useTranslation();

	const brandQuery = useQuery({
		queryKey: queryKeys.manufacturers.detail(slug),
		queryFn: () => fetchManufacturerBySlugClient(slug),
		enabled: !!slug,
	});

	const productsQuery = useQuery({
		queryKey: queryKeys.manufacturers.products(slug),
		queryFn: () => fetchManufacturerProductsClient(brandQuery.data!.id),
		enabled: !!brandQuery.data?.id,
	});

	const brand = brandQuery.data;
	const products = (productsQuery.data ?? []) as Product[];

	if (brandQuery.isLoading) {
		return (
			<PageShell className='flex flex-col items-center justify-center'>
				<Spinner
					size='2xl'
					color='border-primary-100 border-t-primary-500'
					className='mb-6'
				/>
				<p className='text-subtle font-medium tracking-widest uppercase text-sm'>
					{t('common.loading')}
				</p>
			</PageShell>
		);
	}

	if (!brand) {
		return (
			<PageShell className='flex flex-col items-center justify-center p-4 text-center'>
				<div className='text-9xl mb-4 opacity-10 font-black'>404</div>
				<h2 className='text-3xl font-bold text-heading mb-2'>
					Üretici Bulunamadı
				</h2>
				<Link
					href='/manufacturers'
					className='mt-8 px-8 py-3 bg-heading text-inverted rounded-full font-bold hover:bg-primary-600 transition-all shadow-sm'>
					Tüm Üreticilere Dön
				</Link>
			</PageShell>
		);
	}

	return (
		<PageShell className='pb-24 pt-8'>
			<div className='container mx-auto px-4 max-w-7xl'>
				<Link
					href='/manufacturers'
					className='inline-flex items-center gap-2 text-subtle hover:text-primary-600 font-medium mb-8 transition-colors group'>
					<ArrowLeftIcon className='h-4 w-4 transform group-hover:-translate-x-1 transition-transform' />
					{t('brands.backToAll') || 'Tüm Üreticiler'}
				</Link>

				<ManufacturerHero brand={brand} />

				<ManufacturerProductsGrid
					products={products}
					isLoading={productsQuery.isLoading}
				/>
			</div>
		</PageShell>
	);
}

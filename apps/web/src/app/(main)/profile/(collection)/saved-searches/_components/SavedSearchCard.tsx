/** @format */

'use client';

import { MagnifyingGlassIcon, BellIcon, TrashIcon } from '@heroicons/react/24/outline';
import { Badge, Button, IconButton } from '@tarodan/ui';
import { formatDate } from '@/lib/format';
import type { SavedSearch } from '../_lib/types';

export default function SavedSearchCard({
	search,
	onToggleNotify,
	onDelete,
	onRun,
}: {
	search: SavedSearch;
	onToggleNotify: (id: string) => void;
	onDelete: (id: string) => void;
	onRun: (search: SavedSearch) => void;
}) {
	const filters = search.filters;
	const hasFilters = filters && Object.keys(filters).length > 0;

	return (
		<div className='rounded-lg border border-border bg-surface-elevated p-6'>
			<div className='flex items-start justify-between'>
				<div className='flex-1'>
					<h3 className='mb-2 text-lg font-semibold text-heading'>
						&quot;{search.query || 'Tüm ilanlar'}&quot;
					</h3>
					{hasFilters && (
						<div className='mb-3 flex flex-wrap gap-2'>
							{filters?.category && (
								<Badge variant='secondary' size='sm'>
									Kategori: {filters.category}
								</Badge>
							)}
							{filters?.brand && (
								<Badge variant='secondary' size='sm'>
									Marka: {filters.brand}
								</Badge>
							)}
							{(filters?.minPrice || filters?.maxPrice) && (
								<Badge variant='secondary' size='sm'>
									Fiyat: {filters.minPrice || 0}₺ - {filters.maxPrice || '∞'}₺
								</Badge>
							)}
							{filters?.condition && (
								<Badge variant='secondary' size='sm'>
									Durum: {filters.condition}
								</Badge>
							)}
						</div>
					)}
					<p className='text-sm text-muted'>
						Kaydedildi: {formatDate(search.createdAt)}
					</p>
				</div>

				<div className='ml-4 flex items-center gap-2'>
					<IconButton
						variant={search.notifyEnabled ? 'primary' : 'ghost'}
						aria-label={search.notifyEnabled ? 'Bildirimleri kapat' : 'Bildirimleri aç'}
						onClick={() => onToggleNotify(search.id)}>
						<BellIcon className='h-5 w-5' />
					</IconButton>
					<IconButton variant='danger' aria-label='Sil' onClick={() => onDelete(search.id)}>
						<TrashIcon className='h-5 w-5' />
					</IconButton>
				</div>
			</div>

			<div className='mt-4 border-t border-border-subtle pt-4'>
				<Button variant='primary' className='w-full gap-2' onClick={() => onRun(search)}>
					<MagnifyingGlassIcon className='h-5 w-5' />
					Bu Aramayı Çalıştır
				</Button>
			</div>
		</div>
	);
}

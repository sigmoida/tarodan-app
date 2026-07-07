/** @format */

'use client';

import { SearchInput, Select } from '@tarodan/ui';
import { useTranslation } from '@/i18n';
import type { SortOption } from '../_lib/types';

interface Props {
	searchQuery: string;
	onSearchChange: (value: string) => void;
	sortBy: SortOption;
	onSortChange: (value: SortOption) => void;
}

export default function CollectionsToolbar({
	searchQuery,
	onSearchChange,
	sortBy,
	onSortChange,
}: Props) {
	const { t } = useTranslation();

	return (
		<div className='flex flex-col gap-3 sm:flex-row'>
			<SearchInput
				className='flex-1'
				placeholder={t('collection.searchCollections')}
				value={searchQuery}
				onChange={(e) => onSearchChange(e.target.value)}
				onClear={() => onSearchChange('')}
			/>
			<Select
				value={sortBy}
				onChange={(e) => onSortChange(e.target.value as SortOption)}
				className='w-auto'
				selectSize='sm'>
				<option value='recent'>{t('common.newest')}</option>
				<option value='popular'>{t('common.popular')}</option>
				<option value='name'>A-Z</option>
				<option value='items_desc'>{t('common.desc')}</option>
				<option value='items_asc'>{t('common.asc')}</option>
			</Select>
		</div>
	);
}

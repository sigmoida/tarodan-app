/** @format */

'use client';

import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { Button, Input } from '@tarodan/ui';
import { useManufacturers } from '../_context/ManufacturersContext';

export default function ManufacturersToolbar() {
	const {
		searchQuery,
		setSearchQuery,
		selectedCountry,
		setSelectedCountry,
		countries,
	} = useManufacturers();

	return (
		<div className='flex flex-col sm:flex-row items-stretch sm:items-center gap-3'>
			{/* Search */}
			<div className='relative flex-1'>
				<MagnifyingGlassIcon className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle z-10' />
				<Input
					type='text'
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					placeholder='Üretici ara...'
					className='w-full pl-9 pr-4 rounded'
				/>
			</div>

			{/* Country filter */}
			<div className='flex items-center gap-1.5 flex-wrap'>
				{selectedCountry && (
					<Button
						variant='secondary'
						onClick={() => setSelectedCountry(null)}
						className='px-2 py-1.5 text-xs font-semibold text-danger-500 hover:text-danger-700 transition-colors'>
						✕
					</Button>
				)}
				{countries.slice(0, 5).map(([country, info]) => (
					<Button
						variant='secondary'
						key={country}
						onClick={() =>
							setSelectedCountry(selectedCountry === country ? null : country)
						}
						className={`px-2.5 py-1.5 text-xs font-medium border transition-colors rounded ${
							selectedCountry === country
								? 'bg-primary-50 text-primary-700 border-primary-300'
								: 'bg-surface-elevated text-muted border-border hover:border-border'
						}`}>
						{info.flag} {country}
					</Button>
				))}
			</div>
		</div>
	);
}

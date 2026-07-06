/** @format */

'use client';

import { Button } from '@tarodan/ui';
import { useNewListing } from '../_context/NewListingContext';

export default function SubmitBar() {
	const { locale, router, isLoading } = useNewListing();
	return (
		<div className='flex gap-3'>
			<Button
				type='button'
				variant='secondary'
				className='flex-1'
				onClick={() => router.back()}>
				İptal
			</Button>
			<Button
				type='submit'
				variant='primary'
				className='flex-1'
				disabled={isLoading}>
				{isLoading
					? locale === 'en'
						? 'Creating...'
						: 'Oluşturuluyor...'
					: locale === 'en'
						? 'Create Listing'
						: 'İlanı Oluştur'}
			</Button>
		</div>
	);
}

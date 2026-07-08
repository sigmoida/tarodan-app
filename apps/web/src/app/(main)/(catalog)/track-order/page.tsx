/** @format */

import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageShell } from '@/components/layout/PageShell';
import TrackOrderClient from './TrackOrderClient';

export const metadata: Metadata = {
	title: 'Sipariş Takibi | Tarodan',
	description: 'Sipariş numaranız ve e-posta adresinizle siparişinizi takip edin.',
	robots: { index: false, follow: false },
};

export default function TrackOrderPage() {
	return (
		<Suspense
			fallback={
				<PageShell className='flex items-center justify-center'>
					<div className='h-10 w-10 animate-spin rounded-full border-2 border-primary-500 border-t-transparent' />
				</PageShell>
			}>
			<TrackOrderClient />
		</Suspense>
	);
}

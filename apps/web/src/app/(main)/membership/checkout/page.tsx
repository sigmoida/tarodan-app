/** @format */

import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageShell } from '@/components/layout/PageShell';
import MembershipCheckoutClient from './MembershipCheckoutClient';

export const metadata: Metadata = {
	title: 'Üyelik Yükseltme | Tarodan',
	description: 'Üyeliğinizi güvenle yükseltin.',
	robots: { index: false, follow: false },
};

export default function MembershipCheckoutPage() {
	return (
		<Suspense
			fallback={
				<PageShell className='flex items-center justify-center'>
					<div className='h-10 w-10 animate-spin rounded-full border-2 border-primary-500 border-t-transparent' />
				</PageShell>
			}>
			<MembershipCheckoutClient />
		</Suspense>
	);
}

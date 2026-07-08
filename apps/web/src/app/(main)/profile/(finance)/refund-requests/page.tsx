'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@tarodan/ui';
import { PageShell } from '@/components/layout/PageShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from '@/i18n';
import { useRefundRequests } from './_hooks/useRefundRequests';
import RefundRequestCard from './_components/RefundRequestCard';

export default function MyRefundRequestsPage() {
	const router = useRouter();
	const { isAuthenticated, isLoading: authLoading } = useAuthStore();
	const { locale } = useTranslation();

	useEffect(() => {
		if (!authLoading && !isAuthenticated) {
			router.replace('/login?redirect=/profile/refund-requests');
		}
	}, [authLoading, isAuthenticated, router]);

	const { requests, isLoading } = useRefundRequests(isAuthenticated);

	if (authLoading) {
		return (
			<div className='flex min-h-screen items-center justify-center'>
				<Spinner />
			</div>
		);
	}

	return (
		<PageShell>
			<PageHeader
				title={locale === 'en' ? 'Refund Requests' : 'İade Taleplerim'}
				description={
					locale === 'en'
						? 'Track the status of your refund requests.'
						: 'İade taleplerinin durumunu takip et.'
				}
			/>

			{isLoading ? (
				<div className='flex justify-center py-12'>
					<Spinner />
				</div>
			) : requests.length === 0 ? (
				<div className='rounded-lg border border-border bg-surface-elevated p-8 text-center text-muted'>
					{locale === 'en'
						? 'You have no refund requests yet.'
						: 'Henüz iade talebiniz yok.'}
				</div>
			) : (
				<div className='space-y-3'>
					{requests.map((rr) => (
						<RefundRequestCard key={rr.id} request={rr} />
					))}
				</div>
			)}
		</PageShell>
	);
}

'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { Button, Spinner } from '@tarodan/ui';
import { PageShell } from '@/components/layout/PageShell';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from '@/i18n';
import { useRefundDetail, useCancelRefund } from '../_hooks/useRefundRequests';
import RefundStatusStepper from './_components/RefundStatusStepper';
import RefundHero from './_sections/RefundHero';
import StatusCallout from './_sections/StatusCallout';
import ReturnShipmentCard from './_sections/ReturnShipmentCard';
import RelatedOrderCard from './_sections/RelatedOrderCard';
import ReasonCard from './_sections/ReasonCard';
import WhatsNextCard from './_sections/WhatsNextCard';

export default function RefundRequestDetailPage() {
	const params = useParams();
	const router = useRouter();
	const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
	const { locale } = useTranslation();
	const refundId = (params?.id as string) ?? '';

	useEffect(() => {
		if (!authLoading && !isAuthenticated) {
			router.replace(`/login?redirect=/profile/refund-requests/${refundId}`);
		}
	}, [authLoading, isAuthenticated, refundId, router]);

	const { refund } = useRefundDetail(refundId, isAuthenticated);
	const cancelMutation = useCancelRefund(refundId);

	if (authLoading || !refund) {
		return (
			<div className='flex min-h-screen items-center justify-center'>
				<Spinner />
			</div>
		);
	}

	const isBuyer = user?.id === refund.requesterId;
	const isInstantRefund = refund.status === 'refunded' && !refund.returnTrackingNumber;
	const isTerminal = ['refunded', 'rejected', 'cancelled'].includes(refund.status);
	const canCancel = isBuyer && refund.status === 'wait_for_delivery';
	const showReturnShipment =
		['return_shipment_open', 'return_in_transit', 'return_delivered'].includes(refund.status);

	return (
		<PageShell className='pb-24 md:pb-8'>
			<div className='mx-auto w-full max-w-3xl space-y-4 px-4 pt-4'>
				<Link
					href='/profile/refund-requests'
					className='inline-flex items-center gap-2 text-sm text-muted hover:text-heading'>
					<ArrowLeftIcon className='h-4 w-4' />
					{locale === 'en' ? 'Back to refunds' : 'İade taleplerime dön'}
				</Link>

				<RefundHero refund={refund} locale={locale} />

				{!isInstantRefund && <RefundStatusStepper status={refund.status} locale={locale} />}

				<StatusCallout refund={refund} locale={locale} />

				{showReturnShipment && (
					<ReturnShipmentCard refund={refund} isBuyer={isBuyer} locale={locale} />
				)}

				<RelatedOrderCard refund={refund} locale={locale} />

				<ReasonCard refund={refund} locale={locale} />

				{refund.sellerResponse && (
					<div className='rounded-lg border border-warning-200 bg-warning-50 p-5'>
						<h2 className='mb-2 text-sm font-semibold text-warning-900'>
							{locale === 'en' ? "Seller's Response" : 'Satıcı Yanıtı'}
						</h2>
						<p className='whitespace-pre-wrap text-sm text-warning-900'>
							{refund.sellerResponse}
						</p>
					</div>
				)}

				{!isTerminal && <WhatsNextCard status={refund.status} locale={locale} />}

				{canCancel && (
					<div className='rounded-lg border border-border bg-surface-elevated p-5'>
						<Button
							variant='danger'
							onClick={() => cancelMutation.mutate()}
							disabled={cancelMutation.isPending}
							className='w-full sm:w-auto'>
							{locale === 'en' ? 'Cancel This Request' : 'Talebi İptal Et'}
						</Button>
					</div>
				)}
			</div>
		</PageShell>
	);
}

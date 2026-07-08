/** @format */

'use client';

import { useParams } from 'next/navigation';
import { Badge, Button, Spinner } from '@tarodan/ui';
import { PageShell } from '@/components/layout/PageShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { formatTL } from '@/lib/format';
import { useAuthStore } from '@/stores/authStore';
import { useRequireAuth } from '@/lib/useRequireAuth';
import { useTranslation } from '@/i18n';
import { statusMetaOf } from '../_lib/refund-status';
import { useRefundDetail, useCancelRefund } from '../_hooks/useRefundRequests';
import RefundStatusStepper from './_components/RefundStatusStepper';
import StatusCallout from './_sections/StatusCallout';
import ReturnShipmentCard from './_sections/ReturnShipmentCard';
import RelatedOrderCard from './_sections/RelatedOrderCard';
import ReasonCard from './_sections/ReasonCard';
import WhatsNextCard from './_sections/WhatsNextCard';

export default function RefundRequestDetailPage() {
	const params = useParams();
	const { ready } = useRequireAuth();
	const user = useAuthStore((s) => s.user);
	const { locale } = useTranslation();
	const refundId = (params?.id as string) ?? '';

	const { refund } = useRefundDetail(refundId, ready);
	const cancelMutation = useCancelRefund(refundId);

	if (!ready || !refund) {
		return (
			<div className='flex min-h-screen items-center justify-center'>
				<Spinner />
			</div>
		);
	}

	const isBuyer = user?.id === refund.requesterId;
	const meta = statusMetaOf(refund.status);
	const isInstantRefund =
		refund.status === 'refunded' && !refund.returnTrackingNumber;
	const isTerminal = ['refunded', 'rejected', 'cancelled'].includes(
		refund.status,
	);
	const canCancel = isBuyer && refund.status === 'wait_for_delivery';
	const showReturnShipment = [
		'return_shipment_open',
		'return_in_transit',
		'return_delivered',
	].includes(refund.status);

	return (
		<PageShell>
			<PageHeader
				backHref='/profile/refund-requests'
				title={<span className='font-mono'>{refund.refundNumber}</span>}
				description={
					locale === 'en'
						? `Refund Request · ${new Date(refund.createdAt).toLocaleDateString('en-US')}`
						: `İade Talebi · ${new Date(refund.createdAt).toLocaleDateString('tr-TR')}`
				}
				actions={
					<Badge variant={meta.variant}>
						{locale === 'en' ? meta.en : meta.tr}
					</Badge>
				}
			/>

			<div className='rounded-lg border border-border bg-surface-elevated p-4'>
				<div className='flex items-center justify-between'>
					<span className='text-sm text-muted'>
						{locale === 'en' ? 'Refund amount' : 'İade tutarı'}
					</span>
					<span className='text-lg font-bold text-success-700'>
						{formatTL(Number(refund.amount))}
					</span>
				</div>
			</div>

			{!isInstantRefund && (
				<RefundStatusStepper
					status={refund.status}
					locale={locale}
				/>
			)}

			<StatusCallout
				refund={refund}
				locale={locale}
			/>

			{showReturnShipment && (
				<ReturnShipmentCard
					refund={refund}
					isBuyer={isBuyer}
					locale={locale}
				/>
			)}

			<RelatedOrderCard
				refund={refund}
				locale={locale}
			/>

			<ReasonCard
				refund={refund}
				locale={locale}
			/>

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

			{!isTerminal && (
				<WhatsNextCard
					status={refund.status}
					locale={locale}
				/>
			)}

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
		</PageShell>
	);
}

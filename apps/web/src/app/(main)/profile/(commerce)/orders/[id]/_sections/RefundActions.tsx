/** @format */

'use client';

import { ArrowUturnLeftIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { Button, Spinner } from '@tarodan/ui';
import { SectionCard } from '@/components/ui';
import { useConfirm } from '@/components/ConfirmProvider';
import { useTranslation } from '@/i18n';
import { useCancelOrder } from '../_hooks/useOrderDetail';
import { hasShipped, isMembershipOrder, isPastRefundWindow, type OrderDetail } from '../_lib/types';

/**
 * İptal / İade — sadece alıcı. Kargo öncesi "İptal Et" (anında geri ödeme),
 * kargo sonrası "İade Talep Et". Üyelik/dijital siparişler hariç.
 */
export default function RefundActions({
	order,
	onRequestRefund,
}: {
	order: OrderDetail;
	onRequestRefund: () => void;
}) {
	const { locale } = useTranslation();
	const confirm = useConfirm();
	const cancelOrder = useCancelOrder(order.id);

	if (
		!order.payment ||
		order.payment.status !== 'completed' ||
		!order.isBuyer ||
		isMembershipOrder(order) ||
		order.status === 'cancelled' ||
		order.status === 'refunded' ||
		order.activeRefundRequest
	) {
		return null;
	}

	const shipped = hasShipped(order);
	const pastWindow = isPastRefundWindow(order);

	// 14 günden sonra iade yok: kargo sonrası + pencere kapalı ise
	// iade butonu yerine "süre doldu" bilgisi göster.
	if (shipped && pastWindow) {
		return (
			<SectionCard title={locale === 'en' ? 'Refund window closed' : 'İade Süresi Doldu'}>
				<p className='text-sm text-muted'>
					{locale === 'en'
						? 'The 14-day refund window has passed; a refund can no longer be requested for this order.'
						: '14 günlük iade süresi doldu; bu sipariş için artık iade talebi oluşturulamaz.'}
				</p>
			</SectionCard>
		);
	}

	const handleCancel = async () => {
		if (
			!(await confirm({
				title: locale === 'en' ? 'Cancel order' : 'Siparişi iptal et',
				description:
					locale === 'en'
						? 'Cancel this order? Your payment will be refunded.'
						: 'Bu siparişi iptal etmek istediğinize emin misiniz? Ödemeniz iade edilecektir.',
				confirmLabel: locale === 'en' ? 'Yes, cancel' : 'Evet, iptal et',
				cancelLabel: locale === 'en' ? 'No' : 'Vazgeç',
				destructive: true,
			}))
		) {
			return;
		}
		cancelOrder.mutate();
	};

	return (
		<SectionCard
			title={
				shipped
					? locale === 'en'
						? 'Refund'
						: 'İade İşlemi'
					: locale === 'en'
						? 'Cancel Order'
						: 'Siparişi İptal Et'
			}>
			<p className='text-sm text-muted mb-4'>
				{shipped
					? locale === 'en'
						? 'The order has shipped. You can request a refund within 14 days of delivery — no reason or photo required.'
						: 'Sipariş kargoya verildi. Teslimden sonra 14 gün içinde sebep ya da fotoğraf belirtmeden iade talep edebilirsiniz.'
					: locale === 'en'
						? "The order hasn't shipped yet. You can cancel it now and your payment will be refunded."
						: 'Sipariş henüz kargoya verilmedi. Şimdi iptal edebilirsiniz; ödemeniz iade edilecektir.'}
			</p>
			{shipped ? (
				<Button
					variant='secondary'
					size='lg'
					className='w-full flex items-center justify-center gap-2'
					onClick={onRequestRefund}>
					<ArrowUturnLeftIcon className='w-5 h-5' />
					{locale === 'en' ? 'Request Refund' : 'İade Talebi Oluştur'}
				</Button>
			) : (
				<Button
					variant='danger'
					size='lg'
					className='w-full flex items-center justify-center gap-2'
					onClick={handleCancel}
					disabled={cancelOrder.isPending}>
					{cancelOrder.isPending ? (
						<Spinner size='sm' color='border-surface-elevated border-t-transparent' />
					) : (
						<XCircleIcon className='w-5 h-5' />
					)}
					{locale === 'en' ? 'Cancel Order' : 'Siparişi İptal Et'}
				</Button>
			)}
		</SectionCard>
	);
}

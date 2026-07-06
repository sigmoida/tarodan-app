'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Spinner } from '@tarodan/ui';
import { ButtonLink } from '@/components/ui/ButtonLink';
import RefundRequestModal from '@/components/RefundRequestModal';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from '@/i18n';
import { useOrderQuery } from './_hooks/useOrderDetail';
import { inferRefundPhase } from './_lib/types';
import OrderHeader from './_sections/OrderHeader';
import OrderBanners from './_sections/OrderBanners';
import ProductInfoCard from './_sections/ProductInfoCard';
import RefundRequestBanner from './_sections/RefundRequestBanner';
import ShippingInfoCard from './_sections/ShippingInfoCard';
import ShippingAddressCard from './_sections/ShippingAddressCard';
import SellerActions from './_sections/SellerActions';
import PaymentSection from './_sections/PaymentSection';
import EscrowInfoCard from './_sections/EscrowInfoCard';
import ReviewCta from './_sections/ReviewCta';
import RefundActions from './_sections/RefundActions';
import OrderSummaryCard from './_sections/OrderSummaryCard';
import PartyCard from './_sections/PartyCard';
import InvoicesSection from './_sections/InvoicesSection';
import HelpCard from './_sections/HelpCard';
import ReviewModal from './_modals/ReviewModal';

export default function OrderDetailPage() {
	const router = useRouter();
	const params = useParams();
	const queryClient = useQueryClient();
	const { isAuthenticated, isLoading: authLoading } = useAuthStore();
	const { locale } = useTranslation();
	const orderId = params?.id as string;

	const [showReviewModal, setShowReviewModal] = useState(false);
	const [showRefundModal, setShowRefundModal] = useState(false);

	const orderQuery = useOrderQuery(orderId, !authLoading && !!isAuthenticated);
	const rawOrder = orderQuery.data;
	const order =
		rawOrder && typeof rawOrder === 'object' && rawOrder.status !== undefined
			? rawOrder
			: null;
	const loading = orderQuery.isLoading;

	useEffect(() => {
		if (orderQuery.isError && orderId) {
			toast.error(locale === 'en' ? 'Failed to load order' : 'Sipariş yüklenemedi');
			router.push('/profile/orders');
		}
	}, [orderQuery.isError, orderId, locale, router]);

	if (authLoading || loading) {
		return (
			<div className='min-h-screen bg-surface flex items-center justify-center'>
				<Spinner size='xl' />
			</div>
		);
	}

	// Not logged in: show message + link (no redirect – like cart page; avoids flash to login then home)
	if (!authLoading && !isAuthenticated) {
		const loginUrl = `/login?redirect=${encodeURIComponent(`/profile/orders/${orderId}`)}`;
		return (
			<div className='min-h-screen bg-surface flex items-center justify-center'>
				<div className='text-center max-w-md px-4'>
					<p className='text-muted mb-4'>
						{locale === 'en'
							? 'Please log in to view this order.'
							: 'Bu siparişi görüntülemek için giriş yapın.'}
					</p>
					<ButtonLink href={loginUrl} className='inline-block'>
						{locale === 'en' ? 'Log in' : 'Giriş yap'}
					</ButtonLink>
				</div>
			</div>
		);
	}

	if (!order) {
		return (
			<div className='min-h-screen bg-surface flex items-center justify-center'>
				<p className='text-muted'>
					{locale === 'en' ? 'Order not found' : 'Sipariş bulunamadı'}
				</p>
			</div>
		);
	}

	const handleRefund = () => {
		if (order.status === 'pending_payment') {
			toast(
				locale === 'en'
					? 'This order is not paid; cancel it instead'
					: 'Bu sipariş henüz ödenmemiş, iptal etmelisiniz',
			);
			return;
		}
		setShowRefundModal(true);
	};

	return (
		<div className='min-h-screen bg-surface'>
			<main className='max-w-4xl mx-auto px-4 py-8'>
				<OrderHeader order={order} />
				<OrderBanners order={order} />

				<div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
					{/* Main Content */}
					<div className='lg:col-span-2 space-y-6'>
						<ProductInfoCard order={order} />
						<RefundRequestBanner order={order} />
						<ShippingInfoCard order={order} />
						<ShippingAddressCard order={order} />
						<SellerActions order={order} />
						<PaymentSection order={order} />
						<EscrowInfoCard order={order} />
						<ReviewCta order={order} onReview={() => setShowReviewModal(true)} />
						<RefundActions order={order} onRequestRefund={handleRefund} />
					</div>

					{/* Sidebar */}
					<div className='space-y-6'>
						<OrderSummaryCard order={order} />
						<PartyCard order={order} />
						<InvoicesSection order={order} />
						<HelpCard orderId={orderId} />
					</div>
				</div>

				<ReviewModal
					order={showReviewModal ? order : null}
					orderId={orderId}
					onClose={() => setShowReviewModal(false)}
				/>

				<RefundRequestModal
					isOpen={showRefundModal}
					onClose={() => setShowRefundModal(false)}
					orderId={order.id}
					orderNumber={order.orderNumber}
					phase={inferRefundPhase(order)}
					quantity={order.items?.[0]?.quantity ?? 1}
					onSuccess={() => {
						queryClient.invalidateQueries({ queryKey: ['order', orderId] });
					}}
				/>
			</main>
		</div>
	);
}

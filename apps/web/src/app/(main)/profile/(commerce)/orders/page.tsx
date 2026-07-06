'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Spinner, Tabs, TabsList, TabsTrigger } from '@tarodan/ui';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { PageShell } from '@/components/layout/PageShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from '@/i18n';
import {
	useOrders,
	useOrderCounts,
	useInvoiceDownload,
	useReorder,
} from './_hooks/useOrders';
import { groupOrders, type Order, type OrderRole, type OrderStatusFilter } from './_lib/types';
import { type OrderActionHandlers } from './_components/OrderActions';
import OrderCard from './_components/OrderCard';
import OrderGroupAccordion from './_components/OrderGroupAccordion';
import ReviewModal from './_modals/ReviewModal';
import ShippingModal from './_modals/ShippingModal';
import CancelOrderModal from './_modals/CancelOrderModal';

export default function OrdersPage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const { t, locale } = useTranslation();
	const { isAuthenticated, isLoading: authLoading, user } = useAuthStore();

	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);

	const initialRole = (['buyer', 'seller', 'all'].includes(searchParams.get('filter') || '')
		? searchParams.get('filter')
		: 'buyer') as OrderRole;
	const [role, setRole] = useState<OrderRole>(initialRole);
	const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>('active');

	const [reviewingOrder, setReviewingOrder] = useState<Order | null>(null);
	const [shippingOrderId, setShippingOrderId] = useState<string | null>(null);
	const [cancelModalOrder, setCancelModalOrder] = useState<Order | null>(null);

	useEffect(() => {
		if (!mounted || authLoading) return;
		if (!isAuthenticated) router.push('/login?redirect=/profile/orders');
	}, [mounted, isAuthenticated, authLoading, router]);

	const enabled = mounted && !authLoading && isAuthenticated;
	const { orders, isLoading } = useOrders(role, statusFilter, enabled);
	const counts = useOrderCounts(enabled);
	const { downloadingId, download } = useInvoiceDownload();
	const reorder = useReorder();

	const groups = groupOrders(orders);

	const roleTabs: { value: OrderRole; label: string }[] = [
		{ value: 'buyer', label: `${t('profile.totalPurchases')} (${counts.buyer})` },
		{ value: 'seller', label: `${t('profile.totalSales')} (${counts.seller})` },
		{ value: 'all', label: `${t('common.all')} (${counts.buyer + counts.seller})` },
	];
	const statusTabs: { value: OrderStatusFilter; label: string }[] = [
		{ value: 'active', label: locale === 'en' ? 'Active' : 'Aktif' },
		{ value: 'cancelled', label: locale === 'en' ? 'Cancelled' : 'İptal edilenler' },
		{ value: 'refunds', label: locale === 'en' ? 'Refunds' : 'İadeler' },
	];

	const actions: OrderActionHandlers = {
		role,
		userEmail: user?.email,
		downloadingId,
		cancellingId: null,
		onInvoice: download,
		onReorder: reorder,
		onCancel: setCancelModalOrder,
		onShip: (order) => setShippingOrderId(order.id),
		onReview: setReviewingOrder,
	};

	if (!mounted || authLoading || !isAuthenticated) {
		return (
			<div className='flex items-center justify-center py-24'>
				<Spinner size='xl' />
			</div>
		);
	}

	return (
		<PageShell className='pb-16'>
			<PageHeader title={t('order.myOrders')} />

			<div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
				<Tabs value={role} onValueChange={(v) => setRole(v as OrderRole)}>
					<TabsList className='flex flex-wrap'>
						{roleTabs.map((tab) => (
							<TabsTrigger key={tab.value} value={tab.value}>
								{tab.label}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
				<Tabs
					value={statusFilter}
					onValueChange={(v) => setStatusFilter(v as OrderStatusFilter)}>
					<TabsList className='flex flex-wrap'>
						{statusTabs.map((tab) => (
							<TabsTrigger key={tab.value} value={tab.value}>
								{tab.label}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
			</div>

			{isLoading ? (
				<div className='flex justify-center py-12'>
					<Spinner size='xl' />
				</div>
			) : orders.length === 0 ? (
				<div className='rounded-lg bg-surface-elevated py-12 text-center'>
					<p className='text-muted'>{t('order.noOrders')}</p>
					<ButtonLink href='/listings' className='mt-4'>
						{t('cart.browseListings')}
					</ButtonLink>
				</div>
			) : (
				<div className='space-y-4'>
					{groups.map((group) =>
						group.orders.length === 1 ? (
							<OrderCard key={group.key} order={group.orders[0]} actions={actions} />
						) : (
							<OrderGroupAccordion key={group.key} group={group} actions={actions} />
						),
					)}
				</div>
			)}

			<ReviewModal order={reviewingOrder} onClose={() => setReviewingOrder(null)} />
			<ShippingModal orderId={shippingOrderId} onClose={() => setShippingOrderId(null)} />
			<CancelOrderModal
				order={cancelModalOrder}
				onClose={() => setCancelModalOrder(null)}
			/>
		</PageShell>
	);
}

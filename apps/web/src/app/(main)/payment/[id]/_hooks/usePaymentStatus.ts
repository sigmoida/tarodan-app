/** @format */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { paymentsApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

type Phase = 'auth-loading' | 'loading' | 'notfound' | 'ready';

const hasLocalToken = () =>
	typeof window !== 'undefined' && localStorage.getItem('tarodan_authed') === '1';
const urlHasGuest = () =>
	typeof window !== 'undefined' && window.location.search.includes('guest=true');

/**
 * Owns the payment-page lifecycle: loads public config + payment status, routes
 * completed/failed payments away, runs the dev bypass, and exposes the target +
 * cancel/retry actions. The page component stays presentational.
 */
export function usePaymentStatus() {
	const params = useParams();
	const router = useRouter();
	const searchParams = useSearchParams();
	const { isAuthenticated, isLoading: authLoading } = useAuthStore();

	const paymentId = params.id as string;
	const isGuestCheckout = searchParams.get('guest') === 'true';
	const isMembershipPayment = searchParams.get('type') === 'membership';
	const kind = searchParams.get('kind');

	const [payment, setPayment] = useState<any>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [recurringEnabled, setRecurringEnabled] = useState(false);
	const [cancelling, setCancelling] = useState(false);
	const redirectingRef = useRef(false);

	const membershipSuccessUrl = kind
		? `/membership/success?kind=${kind}`
		: '/membership/success';

	const fetchPayment = async () => {
		try {
			setIsLoading(true);
			const isGuest = isGuestCheckout || urlHasGuest();

			let cfg = { bypassEnabled: false, recurringEnabled: false };
			try {
				cfg = (await paymentsApi.getConfig()).data;
			} catch {
				/* safe default: new-card only, no bypass */
			}
			setRecurringEnabled(cfg.recurringEnabled && !isGuest);

			const response = isGuest
				? await paymentsApi.getStatusLightGuest(paymentId)
				: await paymentsApi.getStatusLight(paymentId);
			const paymentData = response.data;
			setPayment(paymentData);

			if (isMembershipPayment && paymentData.status === 'completed') {
				redirectingRef.current = true;
				router.replace(membershipSuccessUrl);
				return;
			}

			if (cfg.bypassEnabled && paymentData.status === 'pending') {
				try {
					const bypassRes = await paymentsApi.bypassComplete(paymentId);
					if (bypassRes.data?.success) {
						toast.success('Ödeme başarılı');
						redirectingRef.current = true;
						const hasSession = isAuthenticated || hasLocalToken();
						router.push(
							isMembershipPayment
								? membershipSuccessUrl
								: `/payment/success?paymentId=${paymentId}${!hasSession ? '&guest=true' : ''}`,
						);
						return;
					}
				} catch {
					/* bypass failed → fall back to the card form */
				}
			}
		} catch (error: any) {
			if (process.env.NODE_ENV === 'development')
				console.error('Failed to fetch payment:', error);
			toast.error('Ödeme bilgisi yüklenemedi');
			redirectingRef.current = true;
			router.push(
				isGuestCheckout ? '/' : isMembershipPayment ? '/membership' : '/profile/orders',
			);
		} finally {
			setIsLoading(false);
		}
	};

	// Auth gate + one-shot fetch (StrictMode double-effect guard).
	const startedRef = useRef(false);
	useEffect(() => {
		if (authLoading) return;
		if (!isAuthenticated && !isGuestCheckout && !urlHasGuest() && !hasLocalToken()) {
			router.push(`/login?redirect=/payment/${paymentId}`);
			return;
		}
		if (startedRef.current) return;
		startedRef.current = true;
		fetchPayment();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [paymentId, authLoading, isAuthenticated, isGuestCheckout]);

	// Route finished payments away once status is known.
	useEffect(() => {
		if (!payment) return;
		if (payment.status === 'completed') {
			redirectingRef.current = true;
			if (isMembershipPayment) router.push(membershipSuccessUrl);
			else router.push(`/payment/success?paymentId=${paymentId}`);
		} else if (payment.status === 'failed') {
			redirectingRef.current = true;
			router.push(`/payment/fail?paymentId=${paymentId}`);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [payment?.status]);

	const handleCancel = async () => {
		setCancelling(true);
		const hasSession = isAuthenticated || hasLocalToken();
		try {
			if (hasSession) {
				await paymentsApi.cancel(paymentId);
				toast.success('Ödeme iptal edildi, ürün tekrar satışa açıldı.');
			}
		} catch {
			/* silent: still navigate back */
		} finally {
			router.push(isGuestCheckout ? '/' : '/cart');
		}
	};

	const onCardSuccess = (pid: string) => {
		if (isMembershipPayment) {
			router.push(membershipSuccessUrl);
		} else if (payment?.tradeId) {
			router.push(`/profile/trades/${payment.tradeId}?paid=1`);
		} else {
			router.push(
				`/payment/success?paymentId=${pid}${isGuestCheckout ? '&guest=true' : ''}`,
			);
		}
	};

	const directTarget = useMemo(
		() => ({
			...(payment?.orderId ? { orderId: payment.orderId as string } : {}),
			...(payment?.checkoutGroupId
				? { checkoutGroupId: payment.checkoutGroupId as string }
				: {}),
			...(payment?.tradeId ? { tradeId: payment.tradeId as string } : {}),
		}),
		[payment?.orderId, payment?.checkoutGroupId, payment?.tradeId],
	);
	const hasTarget =
		!!directTarget.orderId || !!directTarget.checkoutGroupId || !!directTarget.tradeId;

	const guestOk = isGuestCheckout || urlHasGuest();
	const phase: Phase =
		authLoading && !guestOk
			? 'auth-loading'
			: isLoading || redirectingRef.current || payment?.status === 'completed' || payment?.status === 'failed'
				? 'loading'
				: !payment
					? 'notfound'
					: 'ready';

	return {
		phase,
		payment,
		recurringEnabled,
		cancelling,
		handleCancel,
		retry: fetchPayment,
		directTarget,
		hasTarget,
		isMembershipPayment,
		onCardSuccess,
	};
}

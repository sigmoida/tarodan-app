/** @format */

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { useTranslation } from '@/i18n';
import type { MembershipDetails, Period } from '../_lib/types';

interface Args {
	isAuthenticated: boolean;
	isBusinessAccount: boolean;
	membership: MembershipDetails | null;
	fallbackTier: string | null;
	/** Downgrade to free = cancel the paid membership (period stays until end). */
	onDowngradeToFree: () => void;
}

/**
 * Plan-selection state + navigation for the plans grid: period + selected tier,
 * the "is this exactly my current plan" check, deep-link tier scroll, the
 * business-required gate, and continue→login/checkout routing.
 */
export function useTierSelection({
	isAuthenticated,
	isBusinessAccount,
	membership,
	fallbackTier,
	onDowngradeToFree,
}: Args) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const { t } = useTranslation();
	const [selectedPeriod, setSelectedPeriod] = useState<Period>('monthly');
	const [selectedTier, setSelectedTier] = useState<string | null>(null);

	const currentTier = isAuthenticated ? membership?.tier ?? fallbackTier ?? 'free' : null;
	const isRequired = searchParams?.get('required') === 'true';

	// Mevcut faturalama periyodu: dönem uzunluğundan türetilir (>180 gün ≈ yıllık).
	const currentBillingPeriod: Period | undefined = (() => {
		if (!membership?.currentPeriodStart || !membership?.currentPeriodEnd) return undefined;
		const days = Math.round(
			(new Date(membership.currentPeriodEnd).getTime() -
				new Date(membership.currentPeriodStart).getTime()) /
				86_400_000,
		);
		return days > 180 ? 'yearly' : 'monthly';
	})();

	// Mevcut tier + aynı periyot → zaten aktif. Aynı tier farklı periyot = geçerli değişim.
	const isExactCurrentPlan = (tierId: string) =>
		tierId === currentTier && (!currentBillingPeriod || selectedPeriod === currentBillingPeriod);

	// Deep link: ?tier=X → seç + karta kaydır. required=true + business → business seç.
	useEffect(() => {
		const tier = searchParams?.get('tier');
		if (tier) {
			setSelectedTier(tier);
			setTimeout(() => {
				document
					.getElementById(`tier-${tier}`)
					?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			}, 100);
		}
		if (searchParams?.get('required') === 'true' && isBusinessAccount) {
			setSelectedTier('business');
		}
	}, [searchParams, isBusinessAccount]);

	// Business üyelik zorunluysa sayfadan ayrılmayı engelle (popstate → geri getir).
	useEffect(() => {
		if (!(isRequired && isBusinessAccount && currentTier !== 'business')) return;
		const onBeforeUnload = (e: BeforeUnloadEvent) => {
			e.preventDefault();
			e.returnValue = '';
		};
		const onPopState = () => router.push('/membership?required=true');
		window.addEventListener('beforeunload', onBeforeUnload);
		window.addEventListener('popstate', onPopState);
		return () => {
			window.removeEventListener('beforeunload', onBeforeUnload);
			window.removeEventListener('popstate', onPopState);
		};
	}, [isRequired, isBusinessAccount, currentTier, router]);

	const handleSelectTier = (tierId: string) => {
		if (isExactCurrentPlan(tierId)) {
			toast(t('membership.planAlreadyActive'));
			return;
		}
		// Paralı üyelikten free'ye geçiş = iptal (dönem sonuna kadar aktif, iade yok).
		if (tierId === 'free') {
			if (currentTier && currentTier !== 'free') onDowngradeToFree();
			else toast(t('membership.planAlreadyActive'));
			return;
		}
		setSelectedTier(tierId);
	};

	const handleContinue = () => {
		if (!selectedTier || selectedTier === 'free') {
			toast.error(t('membership.selectPlan'));
			return;
		}
		if (!isAuthenticated) {
			toast.error(t('membership.loginToContinue'));
			router.push(`/login?redirect=/membership?tier=${selectedTier}`);
			return;
		}
		const requiredParam = isRequired ? '&required=true' : '';
		const checkoutUrl = `/membership/checkout?tier=${selectedTier}&period=${selectedPeriod}${requiredParam}`;
		// required=true'da daha güvenilir navigasyon için window.location.
		if (isRequired) window.location.href = checkoutUrl;
		else router.push(checkoutUrl);
	};

	return {
		selectedPeriod,
		setSelectedPeriod,
		selectedTier,
		currentTier,
		isRequired,
		isExactCurrentPlan,
		handleSelectTier,
		handleContinue,
	};
}

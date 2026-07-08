'use client';

import { useMemo } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from '@/i18n';
import { PageShell } from '@/components/layout/PageShell';
import { buildTiers, visibleTiers } from './_lib/tiers';
import { useMembershipTiers } from './_hooks/useMembershipTiers';
import { useMyMembership } from './_hooks/useMyMembership';
import { useMembershipActions } from './_hooks/useMembershipActions';
import { useTierSelection } from './_hooks/useTierSelection';
import PlansSection from './_sections/PlansSection';
import CurrentMembershipCard from './_sections/CurrentMembershipCard';
import MembershipStatusBanners from './_sections/MembershipStatusBanners';
import RequiredBusinessBanner from './_sections/RequiredBusinessBanner';
import MembershipFaq from './_sections/MembershipFaq';

/**
 * The interactive membership island. Public: anonymous visitors see the plans
 * and are sent to /login on "continue". Authenticated: also fetches
 * /membership/me and shows the current-membership management + status banners.
 */
export default function MembershipClient() {
	const { t } = useTranslation();
	const { isAuthenticated, user } = useAuthStore();
	const { prices, limits } = useMembershipTiers();
	const { membership } = useMyMembership(isAuthenticated);
	const actions = useMembershipActions();

	const isBusinessAccount = !!(user && user.companyName && user.taxId);

	const {
		selectedPeriod,
		setSelectedPeriod,
		selectedTier,
		currentTier,
		isRequired,
		isExactCurrentPlan,
		handleSelectTier,
		handleContinue,
	} = useTierSelection({
		isAuthenticated,
		isBusinessAccount,
		membership,
		fallbackTier: user?.membershipTier ?? null,
		onDowngradeToFree: actions.cancelMembership,
	});

	const allTiers = useMemo(() => buildTiers(prices, limits, t), [prices, limits, t]);
	const tiers = useMemo(
		() => visibleTiers(allTiers, { isBusinessAccount, currentTier }),
		[allTiers, isBusinessAccount, currentTier],
	);
	const currentTierName = allTiers.find((tier) => tier.id === currentTier)?.name;

	const showRequiredBanner = isRequired && isBusinessAccount && currentTier !== 'business';
	const showCurrentCard =
		isAuthenticated && !!membership?.tier && membership.tier !== 'free';

	return (
		<PageShell>
			<div className='mx-auto w-full max-w-6xl space-y-10 px-4 py-10'>
				{showRequiredBanner && <RequiredBusinessBanner />}

				<div className='space-y-3 text-center'>
					<h1 className='text-3xl font-bold text-heading'>{t('membership.title')}</h1>
					<p className='mx-auto max-w-2xl text-muted'>{t('membership.subtitle')}</p>
				</div>

				{isAuthenticated && membership && (
					<MembershipStatusBanners
						membership={membership}
						currentTier={currentTier}
						currentTierName={currentTierName}
						onCancelScheduledChange={actions.cancelScheduledChange}
					/>
				)}

				{showCurrentCard && membership && (
					<CurrentMembershipCard
						membership={membership}
						autoRenewSaving={actions.autoRenewSaving}
						cancelling={actions.cancelling}
						onToggleAutoRenew={actions.toggleAutoRenew}
						onCancel={actions.cancelMembership}
					/>
				)}

				<PlansSection
					tiers={tiers}
					prices={prices}
					period={selectedPeriod}
					onPeriodChange={setSelectedPeriod}
					selectedTier={selectedTier}
					currentTier={currentTier}
					isAuthenticated={isAuthenticated}
					isExactCurrentPlan={isExactCurrentPlan}
					onSelect={handleSelectTier}
					onContinue={handleContinue}
				/>

				<MembershipFaq />
			</div>
		</PageShell>
	);
}

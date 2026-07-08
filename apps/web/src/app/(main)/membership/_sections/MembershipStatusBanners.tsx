/** @format */

'use client';

import { Button } from '@tarodan/ui';
import { useTranslation } from '@/i18n';
import type { MembershipDetails } from '../_lib/types';

const SCHEDULED_TIER_LABEL: Record<string, string> = {
	basic: 'Temel',
	premium: 'Premium',
	business: 'İş',
};

function fmtDate(iso?: string) {
	return iso
		? new Date(iso).toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' })
		: '';
}

interface Props {
	membership: MembershipDetails;
	currentTier: string | null;
	currentTierName?: string;
	onCancelScheduledChange: () => void;
}

/** The stack of status banners shown to a logged-in member under the header. */
export default function MembershipStatusBanners({
	membership,
	currentTier,
	currentTierName,
	onCancelScheduledChange,
}: Props) {
	const { t } = useTranslation();
	const isPaid = !!currentTier && currentTier !== 'free';
	const isCancelled = membership.status === 'cancelled';

	// İptal edildi ama dönem sürüyor
	if (isCancelled && isPaid) {
		return (
			<div className='mx-auto max-w-md rounded-lg border border-warning-200 bg-warning-50 p-4 text-center'>
				<p className='font-medium text-warning-800'>
					Üyeliğiniz iptal edildi.{' '}
					{membership.currentPeriodEnd
						? `${fmtDate(membership.currentPeriodEnd)} tarihine kadar`
						: 'Dönem sonuna kadar'}{' '}
					premium özellikleriniz devam eder, ardından ücretsiz üyeliğe geçersiniz.
				</p>
			</div>
		);
	}

	// Ertelemeli değişiklik (downgrade / periyot değişimi)
	if (!isCancelled && (membership.scheduledTierType || membership.scheduledBillingPeriod)) {
		const dateStr = membership.currentPeriodEnd
			? `${fmtDate(membership.currentPeriodEnd)} tarihinde`
			: 'dönem sonunda';
		const isTierChange =
			!!membership.scheduledTierType && membership.scheduledTierType !== currentTier;
		const tierLabel = SCHEDULED_TIER_LABEL[membership.scheduledTierType ?? ''] ?? 'Ücretsiz';
		const periodLabel = membership.scheduledBillingPeriod === 'yearly' ? 'yıllık' : 'aylık';
		return (
			<div className='mx-auto max-w-md rounded-lg border border-warning-200 bg-warning-50 p-4 text-center'>
				<p className='font-medium text-warning-800'>
					Üyeliğiniz {dateStr}{' '}
					{isTierChange ? (
						<>
							<span className='font-semibold'>{tierLabel}</span> planına geçecek.
						</>
					) : (
						<>
							<span className='font-semibold'>{periodLabel}</span> faturalamaya geçecek.
						</>
					)}{' '}
					O tarihe kadar mevcut üyelik avantajlarınız devam eder.
				</p>
				<Button variant='ghost' size='sm' onClick={onCancelScheduledChange} className='mt-2'>
					Değişikliği iptal et
				</Button>
			</div>
		);
	}

	// Mevcut plan bilgisi
	if (isPaid) {
		return (
			<div className='mx-auto max-w-md rounded-lg border border-info-200 bg-info-50 p-4 text-center'>
				<p className='font-medium text-info-800'>
					{t('membership.currentPlan')}: {currentTierName || t('membership.free')}
				</p>
			</div>
		);
	}

	return null;
}

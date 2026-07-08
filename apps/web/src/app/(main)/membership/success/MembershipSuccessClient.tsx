/** @format */

'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import { SectionCard } from '@/components/ui';
import { PageShell } from '@/components/layout/PageShell';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { useAuthStore } from '@/stores/authStore';

const TIER_LABELS: Record<string, string> = {
	free: 'Ücretsiz',
	basic: 'Temel',
	premium: 'Premium',
	business: 'İş',
};

const CAN_DO = [
	'Takas teklifleri gönderin ve alın',
	'Koleksiyonlar oluşturun ve paylaşın',
	'Daha fazla ilan yayınlayın',
	'Öncelikli destek alın',
];

export default function MembershipSuccessClient() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const { isAuthenticated, isLoading } = useAuthStore();

	// Soft guard: this page is only meaningful for a signed-in member who just
	// completed an upgrade. Anonymous visitors hitting the URL directly are sent
	// back to the plans. (Full protection would need a server-verified receipt.)
	useEffect(() => {
		if (!isLoading && !isAuthenticated) router.replace('/membership');
	}, [isLoading, isAuthenticated, router]);

	if (isLoading || !isAuthenticated) return null;

	const scheduled = searchParams.get('scheduled') === '1';
	const kind = searchParams.get('kind');
	const tier = searchParams.get('tier') || '';
	const tierLabel = TIER_LABELS[tier] || 'yeni';
	const scheduledPeriod = searchParams.get('period');
	const periodLabel = scheduledPeriod === 'yearly' ? 'yıllık' : 'aylık';

	// Deferred downgrade: no payment, current plan lasts until period end.
	if (scheduled) {
		return (
			<PageShell className='flex items-center justify-center p-4'>
				<SectionCard className='max-w-lg w-full p-8 md:p-10 text-center'>
					<CheckCircleIcon className='mx-auto mb-6 h-14 w-14 text-warning-500' />
					<h1 className='mb-4 text-2xl md:text-3xl font-bold text-heading'>
						Plan değişikliği talebiniz alındı
					</h1>
					<p className='mb-4 text-lg text-muted'>
						{scheduledPeriod ? (
							<>
								Üyeliğiniz mevcut dönem sonunda{' '}
								<span className='font-semibold text-heading'>
									{periodLabel}
								</span>{' '}
								faturalamaya geçecek.
							</>
						) : (
							<>
								Üyeliğiniz mevcut dönem sonunda{' '}
								<span className='font-semibold text-heading'>{tierLabel}</span>{' '}
								planına geçecek.
							</>
						)}
					</p>
					<p className='mb-8 text-muted'>
						O tarihe kadar mevcut üyelik avantajlarınız aynen devam eder;
						herhangi bir ödeme alınmaz. Dönem bitiş tarihinizi üyelik
						sayfanızdan görebilirsiniz.
					</p>
					<div className='space-y-3'>
						<ButtonLink
							variant='primary'
							href='/membership'
							className='w-full'>
							Üyelik Sayfama Git
						</ButtonLink>
						<ButtonLink
							variant='ghost'
							href='/profile'
							className='w-full'>
							Profile Git
						</ButtonLink>
					</div>
				</SectionCard>
			</PageShell>
		);
	}

	const headline =
		kind === 'upgrade'
			? 'Üyeliğiniz başarıyla yükseltildi!'
			: 'Üyeliğiniz başarıyla değiştirildi!';

	return (
		<PageShell className='flex items-center justify-center p-4'>
			<SectionCard className='max-w-lg w-full p-8 md:p-10 text-center'>
				<CheckCircleIcon className='mx-auto mb-6 h-14 w-14 text-success-500' />
				<h1 className='mb-3 text-2xl md:text-3xl font-bold text-heading'>
					Tebrikler!
				</h1>
				<p className='mb-8 text-lg text-muted'>{headline}</p>

				<div className='mb-8 rounded-lg bg-surface p-6 text-left'>
					<h2 className='mb-4 font-semibold text-heading'>
						Artık şunları yapabilirsiniz:
					</h2>
					<ul className='list-disc space-y-2 pl-5 text-muted marker:text-success-500'>
						{CAN_DO.map((item) => (
							<li key={item}>{item}</li>
						))}
					</ul>
				</div>

				<div className='space-y-3'>
					<ButtonLink
						variant='primary'
						href='/listings/new'
						className='w-full'>
						Yeni İlan Oluştur
					</ButtonLink>
					<ButtonLink
						variant='secondary'
						href='/collections'
						className='w-full'>
						Koleksiyon Oluştur
					</ButtonLink>
					<ButtonLink
						variant='ghost'
						href='/profile'
						className='w-full'>
						Profile Git
					</ButtonLink>
				</div>
			</SectionCard>
		</PageShell>
	);
}

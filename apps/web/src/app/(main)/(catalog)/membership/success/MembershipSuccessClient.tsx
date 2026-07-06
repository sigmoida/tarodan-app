/** @format */

'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircleIcon, SparklesIcon } from '@heroicons/react/24/solid';
import { SectionCard } from '@/components/ui';
import { PageShell } from '@/components/layout/PageShell';
import { ButtonLink } from '@/components/ui/ButtonLink';

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
	const searchParams = useSearchParams();
	const kind = searchParams.get('kind');
	const scheduled = searchParams.get('scheduled') === '1';
	const tier = searchParams.get('tier') || '';
	const tierLabel = TIER_LABELS[tier] || 'yeni';
	const scheduledPeriod = searchParams.get('period');
	const periodLabel = scheduledPeriod === 'yearly' ? 'yıllık' : 'aylık';

	// Deferred downgrade: no payment, current plan lasts until period end.
	if (scheduled) {
		return (
			<PageShell className='flex items-center justify-center p-4'>
				<SectionCard className='max-w-lg w-full p-8 md:p-10 text-center'>
					<div className='w-20 h-20 bg-warning-50 rounded-full flex items-center justify-center mx-auto mb-6'>
						<CheckCircleIcon className='w-12 h-12 text-warning-500' />
					</div>
					<h1 className='text-2xl md:text-3xl font-bold text-heading mb-4'>
						Plan değişikliği talebiniz alındı
					</h1>
					<p className='text-lg text-muted mb-4'>
						{scheduledPeriod ? (
							<>
								Üyeliğiniz mevcut dönem sonunda{' '}
								<span className='font-semibold text-heading'>{periodLabel}</span>{' '}
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
					<p className='text-muted mb-8'>
						O tarihe kadar mevcut üyelik avantajlarınız aynen devam eder; herhangi
						bir ödeme alınmaz. Dönem bitiş tarihinizi üyelik sayfanızdan
						görebilirsiniz.
					</p>
					<div className='space-y-3'>
						<ButtonLink variant='primary' href='/profile/membership' className='w-full'>
							Üyelik Sayfama Git
						</ButtonLink>
						<Link
							href='/profile'
							className='block w-full py-3 text-muted font-medium hover:text-body transition-colors'>
							Profile Git →
						</Link>
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
				<div className='w-20 h-20 bg-success-100 rounded-full flex items-center justify-center mx-auto mb-6'>
					<CheckCircleIcon className='w-12 h-12 text-success-500' />
				</div>

				<h1 className='text-2xl md:text-3xl font-bold text-heading mb-3 flex items-center justify-center gap-2'>
					<SparklesIcon className='w-7 h-7 text-warning-500' />
					Tebrikler!
					<SparklesIcon className='w-7 h-7 text-warning-500' />
				</h1>
				<p className='text-lg text-muted mb-8'>{headline}</p>

				<div className='bg-surface rounded-lg p-6 mb-8 text-left'>
					<h2 className='font-semibold text-heading mb-4'>
						Artık şunları yapabilirsiniz:
					</h2>
					<ul className='space-y-3 text-muted'>
						{CAN_DO.map((item) => (
							<li key={item} className='flex items-center gap-3'>
								<CheckCircleIcon className='w-5 h-5 text-success-500 flex-shrink-0' />
								{item}
							</li>
						))}
					</ul>
				</div>

				<div className='space-y-3'>
					<ButtonLink variant='primary' href='/listings/new' className='w-full'>
						Yeni İlan Oluştur
					</ButtonLink>
					<ButtonLink variant='secondary' href='/collections' className='w-full'>
						Koleksiyon Oluştur
					</ButtonLink>
					<Link
						href='/profile'
						className='block w-full py-3 text-muted font-medium hover:text-body transition-colors'>
						Profile Git →
					</Link>
				</div>
			</SectionCard>
		</PageShell>
	);
}

'use client';

import Link from 'next/link';
import { StarIcon, ShieldCheckIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { Button } from '@tarodan/ui';
import { useTranslation } from '@/i18n';
import { DocPage } from '@/components/layout/DocPage';
import { GUIDES } from '../_lib/guides';
import { useActiveGuide } from '../_hooks/useActiveGuide';

export default function GuidesClient() {
	const { t } = useTranslation();
	const { activeGuide, setActiveGuide, currentGuide } = useActiveGuide();

	return (
		<DocPage title={t('guides.title')} description={t('guides.subtitle')}>
			<div id='guide-content' className='scroll-mt-20'>
				{/* Guide Selection Cards */}
				<div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-12'>
					{GUIDES.map((guide) => (
						<Button
							variant='secondary'
							key={guide.id}
							onClick={() => setActiveGuide(guide.id)}
							className={`p-4 rounded-xl text-center transition-all ${
								activeGuide === guide.id
									? 'bg-surface-elevated shadow-lg ring-2 ring-primary-500'
									: 'bg-surface-elevated shadow-sm hover:shadow-md'
							}`}>
							<div
								className={`w-12 h-12 ${guide.bgColor} rounded-xl flex items-center justify-center mx-auto mb-3`}>
								<guide.icon className={`w-6 h-6 ${guide.color}`} />
							</div>
							<span className='text-sm font-medium text-heading'>{guide.title.split(' ')[0]}</span>
						</Button>
					))}
				</div>

				{/* Active Guide Content */}
				<div className='bg-surface-elevated rounded-2xl shadow-sm overflow-hidden'>
					{/* Guide Header */}
					<div className={`${currentGuide.bgColor} p-8`}>
						<div className='flex items-center gap-4 mb-4'>
							<div className='w-16 h-16 bg-surface-elevated rounded-2xl flex items-center justify-center shadow-sm'>
								<currentGuide.icon className={`w-8 h-8 ${currentGuide.color}`} />
							</div>
							<div>
								<h2 className='text-2xl font-bold text-heading'>{currentGuide.title}</h2>
								<p className='text-muted'>{currentGuide.description}</p>
							</div>
						</div>
					</div>

					{/* Steps */}
					<div className='p-8'>
						<div className='space-y-6'>
							{currentGuide.steps.map((step, index) => (
								<div key={index} className='flex gap-4'>
									<div className='flex-shrink-0'>
										<div className='w-10 h-10 bg-primary-500 text-inverted rounded-full flex items-center justify-center font-bold'>
											{index + 1}
										</div>
									</div>
									<div className='flex-1 pt-1'>
										<h3 className='font-semibold text-heading mb-2'>{step.title}</h3>
										<p className='text-muted'>{step.content}</p>
									</div>
								</div>
							))}
						</div>

						{/* Tips */}
						<div className='mt-8 p-6 bg-warning-50 rounded-xl border border-warning-200'>
							<div className='flex items-start gap-3'>
								<StarIcon className='w-6 h-6 text-warning-500 flex-shrink-0' />
								<div>
									<h4 className='font-semibold text-warning-800 mb-2'>{t('guides.proTip')}</h4>
									<p className='text-warning-700 text-sm'>
										{currentGuide.id === 'selling' &&
											'Detaylı açıklamalar ve kaliteli fotoğraflar, ürünlerinizin daha hızlı satılmasını sağlar. Hafta sonları yayınlanan ilanlar daha fazla görüntülenir.'}
										{currentGuide.id === 'buying' &&
											'Satıcı profilini ve değerlendirmelerini mutlaka kontrol edin. Sorularınız varsa satın almadan önce mesaj atın.'}
										{currentGuide.id === 'trade' &&
											'Takas tekliflerinde değer dengesine dikkat edin. Fark varsa açıkça belirtin.'}
										{currentGuide.id === 'photography' &&
											'Telefon kamerası yeterli! Önemli olan ışık ve arka plan. Düzenleme yaparken aşırıya kaçmayın.'}
										{currentGuide.id === 'shipping' &&
											'Kargo sigortası yaptırmayı unutmayın. Özellikle değerli parçalar için mutlaka sigorta alın.'}
										{currentGuide.id === 'getting-started' &&
											'Premium üyelik ile daha fazla ilan verebilir, daha düşük komisyon ödeyebilirsiniz.'}
									</p>
								</div>
							</div>
						</div>
					</div>
				</div>

				{/* Safety Tips */}
				<div className='mt-12 bg-gradient-to-r from-success-500 to-success-600 rounded-2xl p-8 text-inverted'>
					<div className='flex items-start gap-4'>
						<ShieldCheckIcon className='w-12 h-12 flex-shrink-0' />
						<div>
							<h3 className='text-2xl font-bold mb-4'>{t('guides.safetyTips')}</h3>
							<div className='grid md:grid-cols-2 gap-4'>
								{[
									'Ödemeleri her zaman platform üzerinden yapın',
									'Şüpheli fiyatlara dikkat edin',
									'Satıcı değerlendirmelerini kontrol edin',
									'Kargo takip numarasını mutlaka alın',
									'Teslimat sırasında paketi kontrol edin',
									'Sorun olursa 24 saat içinde bildirin',
								].map((tip, index) => (
									<div key={index} className='flex items-center gap-2'>
										<CheckCircleIcon className='w-5 h-5 text-success-200 flex-shrink-0' />
										<span className='text-success-50'>{tip}</span>
									</div>
								))}
							</div>
						</div>
					</div>
				</div>

				{/* Help CTA */}
				<div className='mt-12 text-center'>
					<p className='text-muted mb-4'>{t('guides.stillHaveQuestions')}</p>
					<div className='flex flex-wrap justify-center gap-4'>
						<Link
							href='/faq'
							className='px-6 py-3 bg-surface-alt text-body rounded-xl font-semibold hover:bg-border-subtle transition-colors'>
							{t('guides.faqLink')}
						</Link>
						<Link
							href='/contact'
							className='px-6 py-3 bg-primary-500 text-inverted rounded-xl font-semibold hover:bg-primary-600 transition-colors'>
							{t('guides.contactLink')}
						</Link>
					</div>
				</div>
			</div>
		</DocPage>
	);
}

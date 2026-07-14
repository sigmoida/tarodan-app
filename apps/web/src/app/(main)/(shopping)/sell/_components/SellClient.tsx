'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from "next-intl";
import { useAuthStore } from '@/stores/authStore';
import { DocPage } from '@/components/layout/DocPage';
import SectionCard from '@/components/ui/SectionCard';
import { SELL_BENEFITS, SELL_STEPS } from '../_lib/content';

export default function SellClient() {
	const t = useTranslations();
	const { isAuthenticated } = useAuthStore();

	return (
		<DocPage
			title={t('sellOnWebsite.title')}
			description={t('sellOnWebsite.subtitle')}>
			<SectionCard title={t('sellOnWebsite.benefitsTitle')}>
				<div className='grid grid-cols-1 sm:grid-cols-2 gap-6'>
					{SELL_BENEFITS.map(({ icon: Icon, titleKey, descKey }) => (
						<div
							key={titleKey}
							className='bg-surface-elevated rounded-xl shadow-sm p-6 border border-border-subtle'>
							<div className='flex items-center gap-3 mb-3'>
								<div className='p-2 bg-primary-100 rounded-lg'>
									<Icon className='w-6 h-6 text-primary-600' />
								</div>
								<h3 className='font-semibold text-heading'>
									{t(`sellOnWebsite.${titleKey}` as Parameters<typeof t>[0])}
								</h3>
							</div>
							<p className='text-muted text-sm'>
								{t(`sellOnWebsite.${descKey}` as Parameters<typeof t>[0])}
							</p>
						</div>
					))}
				</div>
			</SectionCard>

			<SectionCard title={t('sellOnWebsite.howTitle')}>
				<div className='flex flex-col sm:flex-row gap-6 sm:gap-4'>
					{SELL_STEPS.map(({ icon: Icon, textKey }, i) => (
						<div key={textKey} className='flex-1 flex items-start gap-4'>
							<div className='flex-shrink-0 w-10 h-10 rounded-full bg-primary-500 text-inverted flex items-center justify-center font-bold'>
								{i + 1}
							</div>
							<div className='flex items-center gap-2 min-w-0'>
								<Icon className='w-5 h-5 text-subtle flex-shrink-0' />
								<p className='text-body'>{t(`sellOnWebsite.${textKey}` as Parameters<typeof t>[0])}</p>
							</div>
						</div>
					))}
				</div>
			</SectionCard>

			<SectionCard title={t('sellOnWebsite.requirementsTitle')}>
				<ul className='space-y-2 text-body'>
					<li className='flex items-center gap-2'>
						<span className='text-primary-500'>•</span>
						{t('sellOnWebsite.req1')}
					</li>
					<li className='flex items-center gap-2'>
						<span className='text-primary-500'>•</span>
						{t('sellOnWebsite.req2')}
					</li>
					<li className='flex items-center gap-2'>
						<span className='text-primary-500'>•</span>
						{t('sellOnWebsite.req3')}
					</li>
				</ul>
			</SectionCard>

			<SectionCard>
				<div className='text-center'>
					<p className='text-muted mb-6'>{t('sellOnWebsite.successStory')}</p>
					<Link
						href={
							isAuthenticated
								? '/listings/new'
								: '/register?redirect=/listings/new'
						}
						className='inline-block px-8 py-4 bg-primary-500 hover:bg-primary-600 text-inverted font-semibold rounded-xl transition-colors'>
						{isAuthenticated
							? t('sellOnWebsite.ctaLoggedIn')
							: t('sellOnWebsite.cta')}
					</Link>
					{!isAuthenticated && (
						<p className='text-sm text-muted mt-3 space-x-4'>
							<Link
								href='/login'
								className='text-primary-500 hover:underline'>
								{t('sellOnWebsite.loginPrompt')}
							</Link>
							<span>·</span>
							<Link
								href='/register/business'
								className='text-primary-500 hover:underline'>
								{t('sellOnWebsite.businessRegister')}
							</Link>
						</p>
					)}
				</div>
			</SectionCard>
		</DocPage>
	);
}

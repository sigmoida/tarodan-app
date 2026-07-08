/** @format */

'use client';

import { useTranslation } from '@/i18n';

export default function MembershipFaq() {
	const { t } = useTranslation();

	const items = [
		{ q: `${t('membership.upgrade')}?`, a: t('membership.subtitle') },
		{ q: `${t('membership.listingsLimit')}?`, a: t('membership.features') },
		{ q: `${t('nav.trades')}?`, a: t('trade.tradeRequiresLogin') },
	];

	return (
		<div className='mx-auto max-w-3xl'>
			<h2 className='mb-6 text-center text-xl font-bold text-heading'>{t('nav.faq')}</h2>
			<div className='space-y-3'>
				{items.map((item, i) => (
					<div key={i} className='rounded-lg border border-border bg-surface-elevated p-5'>
						<h3 className='font-semibold text-heading'>{item.q}</h3>
						<p className='mt-1 text-sm text-muted'>{item.a}</p>
					</div>
				))}
			</div>
		</div>
	);
}

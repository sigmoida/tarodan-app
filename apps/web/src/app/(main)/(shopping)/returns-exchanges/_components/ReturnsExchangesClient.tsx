'use client';

import { useLocale, useTranslations } from "next-intl";
import { DocPage } from '@/components/layout/DocPage';
import SectionCard from '@/components/ui/SectionCard';

export default function ReturnsExchangesClient() {
	const t = useTranslations();

	return (
		<DocPage
			title={t('information.returns.title')}
			description={t('information.returns.subtitle')}>
			<SectionCard>
				<div className='space-y-8'>
					<section>
						<h2 className='mb-2 text-lg font-semibold text-heading'>
							{t('information.returns.policy')}
						</h2>
						<p className='text-body'>{t('information.returns.policyDesc')}</p>
					</section>
					<section>
						<h2 className='mb-2 text-lg font-semibold text-heading'>
							{t('information.returns.process')}
						</h2>
						<p className='text-body'>{t('information.returns.processDesc')}</p>
					</section>
					<section>
						<h2 className='mb-2 text-lg font-semibold text-heading'>
							{t('information.returns.timeline')}
						</h2>
						<p className='text-body'>{t('information.returns.timelineDesc')}</p>
					</section>
				</div>
			</SectionCard>
		</DocPage>
	);
}

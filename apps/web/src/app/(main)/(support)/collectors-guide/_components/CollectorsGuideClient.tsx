'use client';

import { useLocale, useTranslations } from "next-intl";
import { DocPage } from '@/components/layout/DocPage';
import SectionCard from '@/components/ui/SectionCard';

export default function CollectorsGuideClient() {
	const t = useTranslations();

	return (
		<DocPage
			title={t('information.collectorsGuide.title')}
			description={t('information.collectorsGuide.subtitle')}>
			<SectionCard>
				<div className='space-y-8'>
					<section>
						<h2 className='text-lg font-semibold text-heading mb-2'>
							{t('information.collectorsGuide.tips')}
						</h2>
						<p className='text-body'>{t('information.collectorsGuide.tipsDesc')}</p>
					</section>
					<section>
						<h2 className='text-lg font-semibold text-heading mb-2'>
							{t('information.collectorsGuide.grading')}
						</h2>
						<p className='text-body'>{t('information.collectorsGuide.gradingDesc')}</p>
					</section>
					<section>
						<h2 className='text-lg font-semibold text-heading mb-2'>
							{t('information.collectorsGuide.storage')}
						</h2>
						<p className='text-body'>{t('information.collectorsGuide.storageDesc')}</p>
					</section>
					<section>
						<h2 className='text-lg font-semibold text-heading mb-2'>
							{t('information.collectorsGuide.valuation')}
						</h2>
						<p className='text-body'>{t('information.collectorsGuide.valuationDesc')}</p>
					</section>
				</div>
			</SectionCard>
		</DocPage>
	);
}

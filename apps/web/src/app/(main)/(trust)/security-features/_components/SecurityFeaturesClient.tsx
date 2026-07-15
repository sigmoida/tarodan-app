'use client';

import { useLocale, useTranslations } from "next-intl";
import { DocPage } from '@/components/layout/DocPage';
import SectionCard from '@/components/ui/SectionCard';

export default function SecurityFeaturesClient() {
	const t = useTranslations();

	return (
		<DocPage
			title={t('information.security.title')}
			description={t('information.security.subtitle')}>
			<SectionCard>
				<div className='space-y-8'>
					<section>
						<h2 className='mb-2 text-lg font-semibold text-heading'>
							{t('information.security.measures')}
						</h2>
						<p className='text-body'>
							{t('information.security.measuresDesc')}
						</p>
					</section>
					<section>
						<h2 className='mb-2 text-lg font-semibold text-heading'>
							{t('information.security.buyerProtection')}
						</h2>
						<p className='text-body'>
							{t('information.security.buyerProtectionDesc')}
						</p>
					</section>
					<section>
						<h2 className='mb-2 text-lg font-semibold text-heading'>
							{t('information.security.dataPrivacy')}
						</h2>
						<p className='text-body'>
							{t('information.security.dataPrivacyDesc')}
						</p>
					</section>
				</div>
			</SectionCard>
		</DocPage>
	);
}

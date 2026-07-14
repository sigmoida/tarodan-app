'use client';

import { ShieldCheckIcon } from '@heroicons/react/24/outline';
import { useLocale, useTranslations } from "next-intl";
import { DocPage } from '@/components/layout/DocPage';
import SectionCard from '@/components/ui/SectionCard';

export default function PaymentOptionsClient() {
	const t = useTranslations();

	return (
		<DocPage
			title={t('information.paymentOptions.title')}
			description={t('information.paymentOptions.subtitle')}>
			<SectionCard>
				<div className='space-y-8'>
					<section>
						<h2 className='mb-2 text-lg font-semibold text-heading'>
							{t('information.paymentOptions.accepted')}
						</h2>
						<p className='text-body'>
							{t('information.paymentOptions.acceptedDesc')}
						</p>
					</section>
					<section>
						<div className='mb-2 flex items-center gap-2'>
							<ShieldCheckIcon className='h-5 w-5 text-success-600' />
							<h2 className='text-lg font-semibold text-heading'>
								{t('information.paymentOptions.security')}
							</h2>
						</div>
						<p className='text-body'>
							{t('information.paymentOptions.securityDesc')}
						</p>
					</section>
					<section>
						<h2 className='mb-2 text-lg font-semibold text-heading'>
							{t('information.paymentOptions.installments')}
						</h2>
						<p className='text-body'>
							{t('information.paymentOptions.installmentsDesc')}
						</p>
					</section>
				</div>
			</SectionCard>
		</DocPage>
	);
}

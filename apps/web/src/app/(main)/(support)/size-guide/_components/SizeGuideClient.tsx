'use client';

import { useTranslation } from '@/i18n';
import { DocPage } from '@/components/layout/DocPage';
import SectionCard from '@/components/ui/SectionCard';

export default function SizeGuideClient() {
	const { t } = useTranslation();

	const scales = [
		{ scale: t('information.sizeGuide.scale18'), length: '~25–30 cm', note: t('information.sizeGuide.note18') },
		{ scale: t('information.sizeGuide.scale24'), length: '~18–20 cm', note: t('information.sizeGuide.note24') },
		{ scale: t('information.sizeGuide.scale43'), length: '~10–12 cm', note: t('information.sizeGuide.note43') },
		{ scale: t('information.sizeGuide.scale64'), length: '~6–8 cm', note: t('information.sizeGuide.note64') },
	];

	return (
		<DocPage
			title={t('information.sizeGuide.title')}
			description={t('information.sizeGuide.subtitle')}>
			<SectionCard>
				<div className='space-y-8'>
					<p className='text-body'>{t('information.sizeGuide.intro')}</p>
					<section>
						<h2 className='text-lg font-semibold text-heading mb-4'>
							{t('information.sizeGuide.tableTitle')}
						</h2>
						<div className='overflow-x-auto'>
							<table className='w-full border border-border rounded-lg overflow-hidden'>
								<thead>
									<tr className='bg-surface'>
										<th className='text-left px-4 py-3 text-sm font-semibold text-heading border-b border-border'>
											{t('information.sizeGuide.scale')}
										</th>
										<th className='text-left px-4 py-3 text-sm font-semibold text-heading border-b border-border'>
											{t('information.sizeGuide.approxLength')}
										</th>
										<th className='text-left px-4 py-3 text-sm font-semibold text-heading border-b border-border'>
											{t('information.sizeGuide.notes')}
										</th>
									</tr>
								</thead>
								<tbody>
									{scales.map((row, i) => (
										<tr key={i} className='border-b border-border-subtle last:border-0'>
											<td className='px-4 py-3 text-heading font-medium'>{row.scale}</td>
											<td className='px-4 py-3 text-body'>{row.length}</td>
											<td className='px-4 py-3 text-muted'>{row.note}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</section>
				</div>
			</SectionCard>
		</DocPage>
	);
}

'use client';

import Link from 'next/link';
import { useTranslation } from '@/i18n/LanguageContext';
import { DocPage } from '@/components/layout/DocPage';
import SectionCard from '@/components/ui/SectionCard';
import { SITEMAP_SECTIONS } from '../_lib/sections';

export default function SitemapClient() {
	const { t } = useTranslation();

	return (
		<DocPage
			title={t('utility.sitemap.title')}
			description={t('utility.sitemap.subtitle')}>
			<div className='grid gap-4 sm:grid-cols-2'>
				{SITEMAP_SECTIONS.map((section) => (
					<SectionCard key={section.titleKey} title={t(section.titleKey)}>
						<ul className='space-y-2'>
							{section.links.map((link) => (
								<li key={link.href}>
									<Link
										href={link.href}
										className='text-sm text-muted transition-colors hover:text-primary-600'>
										{t(link.labelKey)}
									</Link>
								</li>
							))}
						</ul>
					</SectionCard>
				))}
			</div>

			<p className='text-center text-sm text-muted'>
				<a
					href='/sitemap.xml'
					target='_blank'
					rel='noopener noreferrer'
					className='text-primary-500 hover:underline'>
					XML Sitemap
				</a>
			</p>
		</DocPage>
	);
}

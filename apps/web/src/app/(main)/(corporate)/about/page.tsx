/** @format */

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { DocPage } from '@/components/layout/DocPage';
import SectionCard from '@/components/ui/SectionCard';
import { PageContent } from '@/app/(main)/(trash)/sayfa/[slug]/PageContent';
import { getAboutPage } from './_lib/data';

export async function generateMetadata(): Promise<Metadata> {
	const page = await getAboutPage();
	if (!page) return { title: 'Hakkımızda' };
	return {
		title: page.metaTitle || page.title,
		description: page.metaDescription || undefined,
		keywords: page.metaKeywords || undefined,
		openGraph: {
			title: page.metaTitle || page.title,
			description: page.metaDescription || undefined,
		},
	};
}

export default async function AboutPage() {
	const page = await getAboutPage();
	if (!page) notFound();

	return (
		<DocPage title={page.title}>
			<SectionCard>
				<PageContent content={page.content} />
			</SectionCard>
		</DocPage>
	);
}

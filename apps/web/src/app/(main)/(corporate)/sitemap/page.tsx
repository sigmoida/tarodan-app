/** @format */

import type { Metadata } from 'next';
import SitemapClient from './_components/SitemapClient';

export const metadata: Metadata = {
	title: 'Site Haritası · Tarodan',
	description:
		"Tarodan'daki tüm bölümlere ve sayfalara tek yerden ulaşın: pazar yeri, hesap, destek ve yasal sayfalar.",
	alternates: { canonical: '/sitemap' },
};

export default function SitemapPage() {
	return <SitemapClient />;
}

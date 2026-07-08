/** @format */

import type { Metadata } from 'next';
import NewsletterClient from './_components/NewsletterClient';

export const metadata: Metadata = {
	title: 'Bülten Aboneliği · Tarodan',
	description:
		'Yeni ilanlar, indirimler ve koleksiyon haberleri için Tarodan bültenine ücretsiz abone olun.',
	alternates: { canonical: '/newsletter' },
};

export default function NewsletterPage() {
	return <NewsletterClient />;
}

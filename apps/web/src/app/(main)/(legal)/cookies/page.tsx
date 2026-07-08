/** @format */

import type { Metadata } from 'next';
import CookiesClient from './_components/CookiesClient';

export const metadata: Metadata = {
	title: 'Çerez Politikası · Tarodan',
	description:
		'TARODAN çerez politikası: hangi çerezleri neden kullandığımız, çerez kategorileri ve tercihlerinizi nasıl yönetebileceğiniz.',
	alternates: { canonical: '/cookies' },
};

export default function CookiesPage() {
	return <CookiesClient />;
}

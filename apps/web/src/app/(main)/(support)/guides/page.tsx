/** @format */

import type { Metadata } from 'next';
import GuidesClient from './_components/GuidesClient';

export const metadata: Metadata = {
	title: 'Kullanım Kılavuzları · Tarodan',
	description:
		'TARODAN kullanım kılavuzları: üyelik, alışveriş, satış, takas, fotoğraf ve kargo süreçleri için adım adım rehberler.',
	alternates: { canonical: '/guides' },
};

export default function GuidesPage() {
	return <GuidesClient />;
}

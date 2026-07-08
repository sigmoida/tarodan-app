/** @format */

import type { Metadata } from 'next';
import SupportClient from './_components/SupportClient';

export const metadata: Metadata = {
	title: 'Destek Merkezi · Tarodan',
	description:
		'Sorununuzu bildirin; Tarodan destek ekibi sipariş, ödeme, hesap ve teknik konularda en kısa sürede yardımcı olsun.',
	alternates: { canonical: '/support' },
};

export default function SupportPage() {
	return <SupportClient />;
}

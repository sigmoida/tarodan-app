/** @format */

import type { Metadata } from 'next';
import DistanceSalesClient from './_components/DistanceSalesClient';

export const metadata: Metadata = {
	title: 'Mesafeli Satış Sözleşmesi · Tarodan',
	description:
		'TARODAN mesafeli satış sözleşmesi: taraflar, sözleşme konusu ürün, teslimat, cayma hakkı, uyuşmazlık ve yürürlük hükümleri.',
	alternates: { canonical: '/distance-sales' },
};

export default function DistanceSalesPage() {
	return <DistanceSalesClient />;
}

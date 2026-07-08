/** @format */

import type { Metadata } from 'next';
import SellerAgreementClient from './_components/SellerAgreementClient';

export const metadata: Metadata = {
	title: 'Satıcı Sözleşmesi · Tarodan',
	description:
		'TARODAN platformunda satıcı olmanın koşulları, komisyon ve ödemeler, satıcı yükümlülükleri, yasak ürünler ve fesih şartları.',
	alternates: { canonical: '/seller-agreement' },
};

export default function SellerAgreementPage() {
	return <SellerAgreementClient />;
}

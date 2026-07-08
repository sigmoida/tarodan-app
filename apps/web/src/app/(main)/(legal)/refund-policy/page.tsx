/** @format */

import type { Metadata } from 'next';
import RefundPolicyClient from './_components/RefundPolicyClient';

export const metadata: Metadata = {
	title: 'İade Politikası · Tarodan',
	description:
		'TARODAN iade ve cayma hakkı koşulları: iade süreci, süreler, ödeme iadesi ve mesafeli satış kapsamındaki tüketici hakları.',
	alternates: { canonical: '/refund-policy' },
};

export default function RefundPolicyPage() {
	return <RefundPolicyClient />;
}

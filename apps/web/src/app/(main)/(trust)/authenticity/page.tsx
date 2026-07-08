/** @format */

import type { Metadata } from 'next';
import AuthenticityClient from './_components/AuthenticityClient';

export const metadata: Metadata = {
	title: 'Orijinallik Garantisi · Tarodan',
	description:
		'Tarodan doğrulama süreci, sahtecilik önlemleri ve doğrulanmış satıcı rozetleri ile güvenli alışverişi nasıl sağladığını açıklar.',
	alternates: { canonical: '/authenticity' },
};

export default function AuthenticityPage() {
	return <AuthenticityClient />;
}

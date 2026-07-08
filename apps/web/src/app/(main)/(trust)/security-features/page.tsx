/** @format */

import type { Metadata } from 'next';
import SecurityFeaturesClient from './_components/SecurityFeaturesClient';

export const metadata: Metadata = {
	title: 'Güvenlik ve Gizlilik · Tarodan',
	description:
		'Tarodan güvenlik önlemleri, alıcı koruması ve veri gizliliği uygulamaları ile alışverişinizi nasıl güvende tuttuğunu açıklar.',
	alternates: { canonical: '/security-features' },
};

export default function SecurityFeaturesPage() {
	return <SecurityFeaturesClient />;
}

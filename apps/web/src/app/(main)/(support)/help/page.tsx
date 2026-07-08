/** @format */

import type { Metadata } from 'next';
import HelpClient from './_components/HelpClient';

export const metadata: Metadata = {
	title: 'Yardım Merkezi · Tarodan',
	description:
		'TARODAN yardım merkezi: alışveriş, satış, takas, kargo, güvenlik ve hesap konularında hızlı yanıtlar ve destek.',
	alternates: { canonical: '/help' },
};

export default function HelpCenterPage() {
	return <HelpClient />;
}

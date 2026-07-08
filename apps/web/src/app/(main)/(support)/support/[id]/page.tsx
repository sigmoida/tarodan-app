/** @format */

import type { Metadata } from 'next';
import TicketDetailClient from './_components/TicketDetailClient';

export const metadata: Metadata = {
	title: 'Destek Talebi · Tarodan',
	robots: { index: false, follow: false },
};

export default function SupportTicketDetailPage() {
	return <TicketDetailClient />;
}

/** @format */

import type { Metadata } from 'next';
import EditListingClient from './EditListingClient';

export const metadata: Metadata = {
	title: 'İlanı Düzenle | Tarodan',
	description: 'İlan bilgilerinizi güncelleyin.',
	robots: { index: false, follow: false },
};

export default function EditListingPage() {
	return <EditListingClient />;
}

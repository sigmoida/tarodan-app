/** @format */

import type { Metadata } from 'next';
import EditCollectionClient from './EditCollectionClient';

export const metadata: Metadata = {
	title: 'Koleksiyonu Düzenle | Tarodan',
	description: 'Koleksiyon bilgilerinizi güncelleyin.',
	robots: { index: false, follow: false },
};

export default function EditCollectionPage() {
	return <EditCollectionClient />;
}

/** @format */

import type { Metadata } from 'next';
import LikedCollectionsClient from './LikedCollectionsClient';

export const metadata: Metadata = {
	title: 'Beğendiğim Koleksiyonlar | Tarodan',
	description: 'Beğendiğiniz koleksiyonları görüntüleyin.',
	robots: { index: false, follow: false },
};

export default function LikedCollectionsPage() {
	return <LikedCollectionsClient />;
}

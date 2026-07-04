/** @format */

import type { Metadata } from 'next';
import ProfileClient from './ProfileClient';

export const metadata: Metadata = {
	title: 'Profilim | Tarodan',
	description: 'Hesabınızı, ilanlarınızı, üyeliğinizi ve ayarlarınızı yönetin.',
	robots: { index: false, follow: false },
};

export default function ProfilePage() {
	return <ProfileClient />;
}

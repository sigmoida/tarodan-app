/** @format */

import type { Metadata } from 'next';
import { Noto_Sans } from 'next/font/google';
import './globals.css';
import { Toaster } from 'react-hot-toast';

const notoSans = Noto_Sans({
	subsets: ['latin', 'latin-ext'],
	weight: '400',
});

export const metadata: Metadata = {
	title: 'Tarodan Admin',
	description: 'Tarodan Marketplace yönetim paneli',
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang='tr'>
			<body className={notoSans.className}>
				<Toaster
					position='bottom-right'
					toastOptions={{ style: { maxWidth: '360px' } }}
				/>
				{children}
			</body>
		</html>
	);
}

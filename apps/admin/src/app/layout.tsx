/** @format */

import type { Metadata } from 'next';
import { Figtree } from 'next/font/google';
import './globals.css';
import { Toaster } from 'react-hot-toast';

const figtree = Figtree({ subsets: ['latin', 'latin-ext'], weight: '400' });

export const metadata: Metadata = {
	title: 'Tarodan Admin Panel',
	description: 'Tarodan Marketplace Administration Dashboard',
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang='tr'>
			<body className={figtree.className}>
				<Toaster
					position='bottom-right'
					toastOptions={{ style: { maxWidth: '360px' } }}
				/>
				{children}
			</body>
		</html>
	);
}

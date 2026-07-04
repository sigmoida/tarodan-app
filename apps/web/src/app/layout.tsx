/** @format */

import type { Metadata } from 'next';
import { Noto_Sans } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import './globals.css';
import CookieConsentBanner from '@/components/CookieConsentBanner';
import { LanguageProvider } from '@/i18n/LanguageContext';
import { GoogleOAuthProvider } from '@react-oauth/google';

const notoSans = Noto_Sans({
	subsets: ['latin', 'latin-ext'],
	weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
	metadataBase: new URL(
		process.env.NEXT_PUBLIC_APP_URL || 'https://tarodan.com',
	),
	title: 'Tarodan - Model Araba Pazarı',
	description:
		'Diecast model araba koleksiyoncuları için güvenli alış, satış ve takas platformu',
	robots: {
		index: false,
		follow: false,
		nocache: true,
		googleBot: {
			index: false,
			follow: false,
			noimageindex: true,
			'max-video-preview': -1,
			'max-image-preview': 'none',
			'max-snippet': -1,
		},
	},
	openGraph: {
		type: 'website',
		locale: 'tr_TR',
		url: 'https://tarodan.com',
		siteName: 'Tarodan',
		title: 'Tarodan - Model Araba Pazarı',
		description:
			'Diecast model araba koleksiyoncuları için güvenli alış, satış ve takas platformu',
	},
	twitter: {
		card: 'summary_large_image',
		title: 'Tarodan - Model Araba Pazarı',
		description:
			'Diecast model araba koleksiyoncuları için güvenli alış, satış ve takas platformu',
	},
	icons: {
		icon: '/tarodanfavicon.png',
	},
};

/**
 * Root layout — the app-wide shell only: document, global metadata, and the
 * truly cross-cutting providers (i18n + Google OAuth) plus the global toast and
 * cookie banner. Visual chrome and route gating live in the route-group layouts
 * ((main) owns the storefront; (auth) owns the auth frame). Renders {children}
 * bare — no Navbar/Footer, no marketplace providers.
 */
export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang='tr'>
			<body className={notoSans.className}>
				<LanguageProvider>
					<GoogleOAuthProvider
						clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ''}>
						{children}
						<CookieConsentBanner />
						<Toaster
							position='bottom-right'
							toastOptions={{ style: { maxWidth: '360px' } }}
						/>
					</GoogleOAuthProvider>
				</LanguageProvider>
			</body>
		</html>
	);
}

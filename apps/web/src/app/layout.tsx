import type { Metadata } from 'next';
import { Toaster } from 'react-hot-toast';
import './globals.css';
import Navbar from '@/components/layout/Navbar';
import CategoryNavBar from '@/components/layout/CategoryNavBar';
import Footer from '@/components/layout/Footer';
import CookieConsentBanner from '@/components/CookieConsentBanner';
import { LanguageProvider } from '@/i18n/LanguageContext';
import QueryProvider from './QueryProvider';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://tarodan.com'),
  title: 'Tarodan - Model Araba Pazarı',
  description: 'Diecast model araba koleksiyoncuları için güvenli alış, satış ve takas platformu',
  keywords: 'diecast, model araba, koleksiyon, takas, hot wheels, matchbox, majorette',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'tr_TR',
    url: 'https://tarodan.com',
    siteName: 'Tarodan',
    title: 'Tarodan - Model Araba Pazarı',
    description: 'Diecast model araba koleksiyoncuları için güvenli alış, satış ve takas platformu',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tarodan - Model Araba Pazarı',
    description: 'Diecast model araba koleksiyoncuları için güvenli alış, satış ve takas platformu',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body className="min-h-screen flex flex-col" suppressHydrationWarning>
        <LanguageProvider>
          <QueryProvider>
            <Navbar />
            <CategoryNavBar />
            <main className="flex-1">
              {children}
            </main>
            <Footer />
            <CookieConsentBanner />
            <Toaster
              position="top-right"
              toastOptions={{
                duration: 4000,
                style: {
                  background: '#333',
                  color: '#fff',
                  borderRadius: '12px',
                },
              }}
            />
          </QueryProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}

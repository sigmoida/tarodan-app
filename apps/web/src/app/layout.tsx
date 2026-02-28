import type { Metadata } from 'next';
import { Toaster } from 'react-hot-toast';
import './globals.css';
import Navbar from '@/components/layout/Navbar';
import CategoryNavBarWrapper from '@/components/layout/CategoryNavBarWrapper';
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
            <CategoryNavBarWrapper />
            <main className="flex-1">
              {children}
            </main>
            <Footer />
            <CookieConsentBanner />
            <Toaster
              position="bottom-right"
              toastOptions={{
                duration: 2500,
                style: {
                  background: '#fff',
                  color: '#1a1a1a',
                  borderRadius: '4px',
                  fontSize: '13px',
                  padding: '10px 14px',
                  border: '1px solid #e5e7eb',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                },
                success: {
                  style: { borderLeft: '3px solid #22c55e' },
                },
                error: {
                  style: { borderLeft: '3px solid #ef4444' },
                },
              }}
            />
          </QueryProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}

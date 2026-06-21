import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from 'react-hot-toast';
import AuthBootstrap from '@/components/AuthBootstrap';

const inter = Inter({ subsets: ['latin'] });

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
    <html lang="tr">
      <body className={inter.className}>
        <AuthBootstrap />
        <Toaster position="bottom-right" toastOptions={{ style: { maxWidth: '360px' } }} />
        {children}
      </body>
    </html>
  );
}

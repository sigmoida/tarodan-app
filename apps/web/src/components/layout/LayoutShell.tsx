'use client';

import { usePathname } from 'next/navigation';
import Navbar from './Navbar';
import CategoryNavBarWrapper from './CategoryNavBarWrapper';
import Footer from './Footer';

const AUTH_PATHS = ['/login', '/register', '/forgot-password', '/reset-password', '/verify-email'];

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = AUTH_PATHS.some((p) => pathname.startsWith(p));

  if (isAuthPage) {
    return <main className="flex-1">{children}</main>;
  }

  return (
    <>
      <Navbar />
      <CategoryNavBarWrapper />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}

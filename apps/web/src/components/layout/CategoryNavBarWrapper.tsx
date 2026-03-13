'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import CategoryNavBar from './CategoryNavBar';

const HIDDEN_PATHS = ['/profile', '/login', '/register', '/checkout', '/settings', '/messages', '/guvenli-takas', '/orders', '/favorites', '/trades', '/offers', '/seller', '/collections', '/support', '/forgot-password', '/reset-password', '/verify-email'];

export default function CategoryNavBarWrapper() {
  const pathname = usePathname();
  const shouldHide = HIDDEN_PATHS.some((p) => pathname.startsWith(p));
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let lastScrollY = window.scrollY;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > lastScrollY && currentScrollY > 60) {
        setVisible(false);
      } else {
        setVisible(true);
      }
      lastScrollY = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (shouldHide) return null;

  return (
    <div
      style={{
        transform: visible ? 'translateY(0)' : 'translateY(-100%)',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        transition: 'transform 0.3s ease, opacity 0.3s ease',
      }}
    >
      <CategoryNavBar />
    </div>
  );
}

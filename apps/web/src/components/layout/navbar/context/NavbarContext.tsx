'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useNavbarCounts } from '../hooks/useNavbarCounts';

type AuthStore = ReturnType<typeof useAuthStore.getState>;

interface NavbarContextValue {
  isAuthenticated: boolean;
  user: AuthStore['user'];
  logout: AuthStore['logout'];
  /** True only after hydration + authenticated, so SSR and first client render match. */
  showAuthUI: boolean;
  unreadMessageCount: number;
  unreadNotificationsCount: number;
  pendingOffersCount: number;
  pendingTradesCount: number;
  cartCount: number;
  wishlistCount: number;
  showAuthModal: boolean;
  setShowAuthModal: (open: boolean) => void;
  showTradesAuthModal: boolean;
  setShowTradesAuthModal: (open: boolean) => void;
}

const NavbarContext = createContext<NavbarContextValue | null>(null);

export function NavbarProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user, logout, checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Defer auth-dependent UI until after hydration so server and first client
  // render always match (avoids hydration error).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const showAuthUI = mounted && isAuthenticated;

  const counts = useNavbarCounts(showAuthUI);

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showTradesAuthModal, setShowTradesAuthModal] = useState(false);

  const value: NavbarContextValue = {
    isAuthenticated,
    user,
    logout,
    showAuthUI,
    ...counts,
    showAuthModal,
    setShowAuthModal,
    showTradesAuthModal,
    setShowTradesAuthModal,
  };

  return <NavbarContext.Provider value={value}>{children}</NavbarContext.Provider>;
}

export function useNavbar(): NavbarContextValue {
  const ctx = useContext(NavbarContext);
  if (!ctx) {
    throw new Error('useNavbar must be used within a NavbarProvider');
  }
  return ctx;
}

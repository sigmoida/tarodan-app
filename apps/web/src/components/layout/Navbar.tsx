'use client';

import { NavbarProvider } from './navbar/context/NavbarContext';
import { useHideOnScroll } from './navbar/hooks/useHideOnScroll';
import NavbarTopAds from './navbar/NavbarTopAds';
import NavbarLogo from './navbar/NavbarLogo';
import NavbarSearch from './navbar/NavbarSearch';
import NavbarActions from './navbar/NavbarActions';
import AccountMenu from './navbar/AccountMenu';
import NavbarCart from './navbar/NavbarCart';
import NavbarAuthModals from './navbar/NavbarAuthModals';

export default function Navbar() {
  const navHidden = useHideOnScroll();

  return (
    <NavbarProvider>
      {/* Slim Top Bar - Image Marquee (50px / 40px mobile) */}
      <NavbarTopAds />

      <nav className={`bg-primary-500 border-b border-primary-600 sticky top-0 z-50 shadow-sm transition-transform duration-300 ${navHidden ? '-translate-y-full' : 'translate-y-0'}`}>
        {/* Inner container bounded to max-w-screen-2xl so header content never
            stretches on ultra-wide screens (matches the main content container). */}
        <div className="mx-auto max-w-screen-2xl px-6 sm:px-8 lg:px-12 xl:px-16">
          <div className="flex items-center gap-4 h-14 lg:h-16 max-h-14 lg:max-h-16 min-h-0">
            {/* Logo */}
            <NavbarLogo />

            {/* Arama - ortada */}
            <NavbarSearch />

            {/* Right - İlan Ver + Menü + Hesap dropdown */}
            <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
              <NavbarActions />
              <AccountMenu />
              {/* Sepet - en sağda, Giriş Yap'ın sağında ikon + yazı */}
              <NavbarCart />
            </div>
          </div>
        </div>
      </nav>

      {/* Auth modals must be outside nav to escape its stacking context */}
      <NavbarAuthModals />
    </NavbarProvider>
  );
}

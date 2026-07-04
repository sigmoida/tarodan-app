'use client';

import Link from 'next/link';
import { ShoppingCartIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n/LanguageContext';
import { useNavbar } from './context/NavbarContext';

/**
 * Cart link at the far right of the bar, with the item-count badge.
 */
export default function NavbarCart() {
  const { t } = useTranslation();
  const { cartCount } = useNavbar();

  return (
    <Link
      href="/cart"
      className="flex items-center justify-center gap-1.5 h-9 px-3 text-inverted hover:text-primary-100 hover:bg-surface-elevated/10 rounded-md text-sm font-medium transition-colors relative"
      title={t('nav.cart')}
    >
      <ShoppingCartIcon className="w-5 h-5" />
      <span className="hidden sm:inline">{t('nav.cart')}</span>
      {cartCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-surface-elevated text-primary-500 text-xs rounded-full flex items-center justify-center font-semibold">
          {cartCount > 9 ? '9+' : cartCount}
        </span>
      )}
    </Link>
  );
}

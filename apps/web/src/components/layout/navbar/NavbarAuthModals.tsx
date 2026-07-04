'use client';

import dynamic from 'next/dynamic';
import { PlusIcon, ArrowsRightLeftIcon } from '@heroicons/react/24/outline';
import { withChunkErrorLogging } from '@/lib/dynamicWithLogging';
import { useTranslation } from '@/i18n/LanguageContext';
import { useNavbar } from './context/NavbarContext';

const AuthRequiredModal = dynamic(
  withChunkErrorLogging(() => import('@/components/AuthRequiredModal'), 'AuthRequiredModal'),
  { ssr: false }
);

/**
 * The auth-required modals triggered from the navbar (create-listing + trades).
 * Rendered outside the nav so they escape its stacking context; open state is
 * shared through the navbar context so the triggers can live in child cluster
 * components.
 */
export default function NavbarAuthModals() {
  const { t } = useTranslation();
  const { showAuthModal, setShowAuthModal, showTradesAuthModal, setShowTradesAuthModal } = useNavbar();

  return (
    <>
      <AuthRequiredModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        title={t('nav.loginToCreateListing')}
        message={t('nav.loginToCreateListingMsg')}
        icon={<PlusIcon className="w-10 h-10 text-primary-500" />}
        redirectPath="/listings/new"
      />

      <AuthRequiredModal
        isOpen={showTradesAuthModal}
        onClose={() => setShowTradesAuthModal(false)}
        title={t('nav.loginForTrades')}
        message={t('trade.tradeRequiresLogin')}
        icon={<ArrowsRightLeftIcon className="w-10 h-10 text-primary-500" />}
        redirectPath="/trades"
      />
    </>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { hasGuestCheckoutMarker, isGuestFromUrl } from '@/lib/guestCheckout';

/**
 * Misafir ödeme akışını güvenilir biçimde tespit eden paylaşılan hook.
 *
 * Guest-lik üç kaynaktan teyit edilir: URL param'ı, doğrudan window.location.search
 * ve kalıcı sessionStorage işareti. Böylece bunlardan biri kaybolsa bile (hidrasyon
 * yarışı, PayTR fail URL'i, vb.) kullanıcı yanlışlıkla /login'e atılmaz.
 *
 * `ready` bayrağı, SSR/hidrasyon penceresinde guest kararı verilmesini engeller:
 * yalnız client'ta ilk effect çalıştıktan sonra `true` olur. Çağıranlar
 * `if (!ready) return;` ile erken yönlendirmeyi önlemeli.
 */
export function useIsGuestCheckout(): { isGuest: boolean; ready: boolean } {
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isGuest =
    searchParams.get('guest') === 'true' ||
    isGuestFromUrl() ||
    hasGuestCheckoutMarker();

  return { isGuest, ready: mounted };
}

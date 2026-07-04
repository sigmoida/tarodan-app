'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Üyelik yönetimi tek sayfada toplandı: /profile/membership.
 * Bu eski rota artık oraya yönlendirir (geriye dönük linkler kırılmasın).
 */
export default function MembershipManageRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/profile/membership');
  }, [router]);
  return null;
}

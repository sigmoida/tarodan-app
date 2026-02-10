'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Seller Registration = business/company signup.
 * Redirect to the existing business registration page.
 */
export default function SellerRegisterRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/register/business');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-gray-500">Yönlendiriliyorsunuz…</p>
    </div>
  );
}

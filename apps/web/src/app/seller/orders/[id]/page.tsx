'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Email templates link to /seller/orders/:orderId.
 * Redirect to the main order detail page so the link works.
 */
export default function SellerOrderRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params?.id as string;

  useEffect(() => {
    if (orderId) {
      router.replace(`/orders/${orderId}`);
    }
  }, [orderId, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-gray-500">Yönlendiriliyorsunuz…</p>
    </div>
  );
}

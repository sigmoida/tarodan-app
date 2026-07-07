'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function PricingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const tier = searchParams?.get('tier');
    const redirectUrl = tier
      ? `/membership?tier=${tier}`
      : '/membership';
    router.replace(redirectUrl);
  }, [router, searchParams]);

  return null;
}

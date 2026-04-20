'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@tarodan/ui';

export default function MembershipPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to pricing page
    router.replace('/pricing');
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Spinner size="xl" />
    </div>
  );
}

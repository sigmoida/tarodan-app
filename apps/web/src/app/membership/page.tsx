'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function MembershipPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to pricing page
    router.replace('/pricing');
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
    </div>
  );
}

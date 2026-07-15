"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Redirect /orders/track to /track-order (guest order tracking).
 * /track-order is a standalone route so it is never treated as protected by auth.
 */
export default function OrdersTrackRedirectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const qs = searchParams.toString();
    router.replace(qs ? `/track-order?${qs}` : "/track-order");
  }, [router, searchParams]);

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <p className="text-muted">Yönlendiriliyor...</p>
    </div>
  );
}

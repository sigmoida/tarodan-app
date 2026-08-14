"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

/**
 * Redirect /orders/track to /track-order (guest order tracking).
 * /track-order is a standalone route so it is never treated as protected by auth.
 */
export default function OrdersTrackRedirectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations();

  useEffect(() => {
    const qs = searchParams.toString();
    router.replace(qs ? `/track-order?${qs}` : "/track-order");
  }, [router, searchParams]);

  return (
    <div className="min-h-dvh bg-surface flex items-center justify-center">
      <p className="text-muted">{t("profile.boost.redirecting")}</p>
    </div>
  );
}

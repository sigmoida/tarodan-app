"use client";

import dynamic from "next/dynamic";

const CookieConsentBanner = dynamic(
  () => import("@/components/CookieConsentBanner"),
  { ssr: false },
);

/**
 * Keeps the consent UI (and its animation dependency) out of the shared
 * server-rendered layout bundle. The banner reads browser-only storage after
 * hydration, so server rendering it would not provide any useful UI.
 */
export default function DynamicCookieConsentBanner() {
  return <CookieConsentBanner />;
}

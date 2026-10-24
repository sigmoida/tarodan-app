"use client";

import Script from "next/script";
import { APPLE_JS_URL, isAppleSignInAvailable } from "./useAppleCredential";

/**
 * Loads Apple's JS SDK after hydration, so it is ready before the user clicks
 * an Apple button (the popup must open in the click handler itself). Render it
 * on every surface that offers Apple; `next/script` loads one copy per page.
 * Renders nothing when Apple is not configured.
 */
export function AppleSdkScript() {
  if (!isAppleSignInAvailable()) return null;
  return <Script src={APPLE_JS_URL} strategy="afterInteractive" />;
}

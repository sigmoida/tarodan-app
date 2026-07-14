"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";
import { useLocale, useTranslations } from "next-intl";
import { TransitionLoader } from "@/components/TransitionLoader";

/** How long the loading screen stays up before landing on the home page. */
const LOGOUT_REDIRECT_DELAY_MS = 1200;

/**
 * Dedicated sign-out screen. Every "Çıkış Yap" action routes here instead of
 * clearing auth inline, so the user always sees a clean loading state (no blank
 * flash) while the session is revoked, then lands on the home page. Lives
 * outside the (main) group on purpose — no storefront chrome around the loader.
 */
export default function LogoutPage() {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const locale = useLocale();
  const ran = useRef(false);

  useEffect(() => {
    // React 18 StrictMode mounts effects twice in dev — guard so logout + the
    // redirect fire exactly once. No cleanup on purpose: a StrictMode unmount
    // would otherwise cancel the only timer, and the timer's sole effect is the
    // navigation we want anyway.
    if (ran.current) return;
    ran.current = true;

    void logout();
    setTimeout(() => router.replace("/"), LOGOUT_REDIRECT_DELAY_MS);
  }, [logout, router]);

  return (
    <TransitionLoader
      message={locale === "tr" ? "Çıkış yapılıyor..." : "Signing out..."}
    />
  );
}

"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import type { Locale } from "@tarodan/i18n";
import { usePathname, useRouter } from "@/i18n/navigation";
import { resolvePreferredLocale } from "@/lib/userExperiencePolicy.mjs";
import { useAuthStore } from "@/stores/authStore";

export default function PreferredLanguageSync() {
  const currentLocale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading, user } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated || isLoading) return;
    const nextLocale = resolvePreferredLocale(
      user?.preferredLanguage,
      currentLocale,
    ) as Locale | null;
    if (!nextLocale) return;

    const query = Object.fromEntries(searchParams.entries());
    router.replace({ pathname, query }, { locale: nextLocale });
  }, [
    currentLocale,
    isAuthenticated,
    isLoading,
    pathname,
    router,
    searchParams,
    user?.preferredLanguage,
  ]);

  return null;
}

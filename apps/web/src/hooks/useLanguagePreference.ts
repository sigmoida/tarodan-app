"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { getMessages, type Locale } from "@tarodan/i18n";
import { usePathname, useRouter } from "@/i18n/navigation";
import { userApi } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";

export function useLanguagePreference() {
  const currentLocale = useLocale() as Locale;
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, user, setUser } = useAuthStore();
  const [savingLocale, setSavingLocale] = useState<Locale | null>(null);

  const changeLanguage = async (nextLocale: Locale) => {
    if (savingLocale) return;
    setSavingLocale(nextLocale);
    try {
      if (isAuthenticated && user) {
        await userApi.updateProfile({ preferredLanguage: nextLocale });
        setUser({ ...user, preferredLanguage: nextLocale });
      }

      const query = Object.fromEntries(searchParams.entries());
      router.replace({ pathname, query }, { locale: nextLocale });
      if (isAuthenticated) {
        toast.success(getMessages(nextLocale).language.saved);
      }
    } catch {
      toast.error(t("language.saveFailed"));
    } finally {
      setSavingLocale(null);
    }
  };

  return { currentLocale, savingLocale, changeLanguage };
}

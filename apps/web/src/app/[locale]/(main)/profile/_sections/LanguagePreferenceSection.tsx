"use client";

import type { Locale } from "@tarodan/i18n";
import { Button } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { LanguageIcon } from "@heroicons/react/24/outline";
import SectionCard from "@/components/ui/SectionCard";
import { useLanguagePreference } from "@/hooks/useLanguagePreference";

const LANGUAGES: Array<{
  value: Locale;
  labelKey: "language.turkish" | "language.english";
}> = [
  { value: "tr", labelKey: "language.turkish" },
  { value: "en", labelKey: "language.english" },
];

export default function LanguagePreferenceSection() {
  const t = useTranslations();
  const { currentLocale, savingLocale, changeLanguage } =
    useLanguagePreference();

  return (
    <SectionCard title={t("profile.preferencesTitle")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <LanguageIcon className="h-5 w-5 text-primary-500" aria-hidden />
          <span className="text-sm font-medium text-heading">
            {t("language.language")}
          </span>
        </div>
        <div
          className="grid w-full grid-cols-2 rounded-md border border-border p-1 sm:w-64"
          role="group"
          aria-label={t("language.selectLanguage")}
        >
          {LANGUAGES.map(({ value, labelKey }) => {
            const active = currentLocale === value;
            return (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={active ? "primary" : "ghost"}
                aria-pressed={active}
                isLoading={savingLocale === value}
                disabled={savingLocale !== null}
                onClick={() => {
                  void changeLanguage(value);
                }}
              >
                {t(labelKey)}
              </Button>
            );
          })}
        </div>
      </div>
    </SectionCard>
  );
}

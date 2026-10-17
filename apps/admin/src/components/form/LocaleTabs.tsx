"use client";

import type { ReactNode } from "react";
import { useFormContext } from "react-hook-form";
import { useTranslations } from "next-intl";
import { AdminTabs } from "@/components/AdminTabs";
import {
  LOCALE_LANGS,
  localizedKey,
  type LocaleLang,
} from "@/lib/localized-form";

/**
 * TR/EN sekmeli alan grubu. `bases` çift dilli alanların taban adlarıdır
 * (`title` → `titleTr`/`titleEn`); görünmeyen sekmede hata varsa sekme etiketi
 * hata sayısını taşır. Sekme durumu çağıranda yaşar (önizleme de aynı dili okur).
 */
export function LocaleTabs({
  bases,
  value,
  onChange,
  children,
}: {
  bases: readonly string[];
  value: LocaleLang;
  onChange: (lang: LocaleLang) => void;
  children: (lang: LocaleLang) => ReactNode;
}) {
  const t = useTranslations();
  const {
    formState: { errors },
  } = useFormContext();
  const tabs = LOCALE_LANGS.map((lang) => {
    const errorCount = bases.filter(
      (b) => errors[localizedKey(b, lang)],
    ).length;
    return {
      key: lang,
      label: t(`admin.marketing.localeTabs.${lang}`),
      badge: errorCount > 0 ? errorCount : undefined,
    };
  });
  return (
    <div className="space-y-3">
      <AdminTabs
        tabs={tabs}
        value={value}
        onChange={(k) => onChange(k as LocaleLang)}
      />
      {children(value)}
    </div>
  );
}

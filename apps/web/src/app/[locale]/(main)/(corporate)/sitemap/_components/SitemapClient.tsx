"use client";

import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { DocPage } from "@/components/layout/DocPage";
import SectionCard from "@/components/ui/SectionCard";
import { SITEMAP_SECTIONS } from "../_lib/sections";

export default function SitemapClient() {
  const t = useTranslations();

  return (
    <DocPage
      title={t("utility.sitemap.title")}
      description={t("utility.sitemap.subtitle")}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {SITEMAP_SECTIONS.map((section) => (
          <SectionCard
            key={section.titleKey}
            title={t(section.titleKey as Parameters<typeof t>[0])}
          >
            <ul className="space-y-2">
              {section.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted transition-colors hover:text-primary-600"
                  >
                    {t(link.labelKey as Parameters<typeof t>[0])}
                  </Link>
                </li>
              ))}
            </ul>
          </SectionCard>
        ))}
      </div>
    </DocPage>
  );
}

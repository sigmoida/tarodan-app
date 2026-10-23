import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { localizedCanonical, localizedPath } from "@/lib/seo";
import type { Translate } from "@/types/i18n";
import HomeContent from "./_home/_components/HomeContent";
import { loadHomePageData } from "./_home/lib/data";

const TITLE = (t: Translate) =>
  t("page.app.page.tarodanDiecastModelArabaPazari");
const DESCRIPTION = (t: Translate) =>
  t("page.app.page.diecastModelArabaKoleksiyonculariIcinGuvenli");

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return {
    title: TITLE(t),
    description: DESCRIPTION(t),
    alternates: localizedCanonical(locale, "/"),
    openGraph: {
      title: TITLE(t),
      description: DESCRIPTION(t),
      type: "website",
      url: localizedPath(locale, "/"),
    },
    twitter: {
      card: "summary_large_image",
      title: TITLE(t),
      description: DESCRIPTION(t),
    },
  };
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // Throws when a product rail fails at runtime, so ISR keeps the last good
  // page instead of caching one with the rail hidden (see `_home/lib/data.ts`).
  const data = await loadHomePageData();
  return <HomeContent data={data} locale={locale} />;
}

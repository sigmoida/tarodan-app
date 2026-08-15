/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import GuidesClient from "./_components/GuidesClient";
import { getTranslations } from "next-intl/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return {
    title: t("page.guides.page.kullanimKilavuzlariTarodan"),
    description: t(
      "page.guides.page.tarodanKullanimKilavuzlariUyelikAlisverisSatis",
    ),
    alternates: localizedCanonical(locale, "/guides"),
  };
}

export default function GuidesPage() {
  return <GuidesClient />;
}

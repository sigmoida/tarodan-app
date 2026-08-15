/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import SitemapClient from "./_components/SitemapClient";
import { getTranslations } from "next-intl/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return {
    title: t("page.sitemap.page.siteHaritasiTarodan"),
    description: t("page.sitemap.page.tarodanDakiTumBolumlereVeSayfalara"),
    alternates: localizedCanonical(locale, "/sitemap"),
  };
}

export default function SitemapPage() {
  return <SitemapClient />;
}

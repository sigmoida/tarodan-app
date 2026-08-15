/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import NewsletterClient from "./_components/NewsletterClient";
import { getTranslations } from "next-intl/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return {
    title: t("page.newsletter.page.bultenAboneligiTarodan"),
    description: t(
      "page.newsletter.page.yeniIlanlarIndirimlerVeKoleksiyonHaberleri",
    ),
    alternates: localizedCanonical(locale, "/newsletter"),
  };
}

export default function NewsletterPage() {
  return <NewsletterClient />;
}

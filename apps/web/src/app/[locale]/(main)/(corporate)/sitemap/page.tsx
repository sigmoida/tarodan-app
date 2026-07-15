/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import SitemapClient from "./_components/SitemapClient";

export function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Metadata {
  return {
    title: "Site Haritası · Tarodan",
    description:
      "Tarodan'daki tüm bölümlere ve sayfalara tek yerden ulaşın: pazar yeri, hesap, destek ve yasal sayfalar.",
    alternates: localizedCanonical(locale, "/sitemap"),
  };
}

export default function SitemapPage() {
  return <SitemapClient />;
}

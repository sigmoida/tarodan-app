/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import NewsletterClient from "./_components/NewsletterClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "Bülten Aboneliği · Tarodan",
    description:
      "Yeni ilanlar, indirimler ve koleksiyon haberleri için Tarodan bültenine ücretsiz abone olun.",
    alternates: localizedCanonical(locale, "/newsletter"),
  };
}

export default function NewsletterPage() {
  return <NewsletterClient />;
}

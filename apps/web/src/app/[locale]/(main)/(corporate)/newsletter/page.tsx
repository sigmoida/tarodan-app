/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import NewsletterClient from "./_components/NewsletterClient";

export function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Metadata {
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

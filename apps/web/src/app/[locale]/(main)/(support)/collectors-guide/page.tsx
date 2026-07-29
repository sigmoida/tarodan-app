/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import CollectorsGuideClient from "./_components/CollectorsGuideClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "Koleksiyon Rehberi · Tarodan",
    description:
      "Model araba koleksiyonculuğu için ipuçları: derecelendirme, saklama koşulları ve değerleme üzerine kapsamlı rehber.",
    alternates: localizedCanonical(locale, "/collectors-guide"),
  };
}

export default function CollectorsGuidePage() {
  return <CollectorsGuideClient />;
}

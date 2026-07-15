/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import CollectorsGuideClient from "./_components/CollectorsGuideClient";

export function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Metadata {
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

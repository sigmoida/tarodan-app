/** @format */

import type { Metadata } from "next";
import CollectorsGuideClient from "./_components/CollectorsGuideClient";

export const metadata: Metadata = {
  title: "Koleksiyon Rehberi · Tarodan",
  description:
    "Model araba koleksiyonculuğu için ipuçları: derecelendirme, saklama koşulları ve değerleme üzerine kapsamlı rehber.",
  alternates: { canonical: "/collectors-guide" },
};

export default function CollectorsGuidePage() {
  return <CollectorsGuideClient />;
}

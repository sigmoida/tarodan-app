/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import SellClient from "./_components/SellClient";

export function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Metadata {
  return {
    title: "Burada Satış Yapın · Tarodan",
    description:
      "Model araba koleksiyonunuzu Tarodan üzerinde satışa çıkarın; güvenli ödeme ve geniş alıcı kitlesiyle buluşun.",
    alternates: localizedCanonical(locale, "/sell"),
  };
}

export default function SellPage() {
  return <SellClient />;
}

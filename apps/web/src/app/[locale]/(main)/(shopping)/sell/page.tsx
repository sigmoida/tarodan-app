/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import SellClient from "./_components/SellClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
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

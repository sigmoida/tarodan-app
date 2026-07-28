/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import SupportClient from "./_components/SupportClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "Destek Merkezi · Tarodan",
    description:
      "Sorununuzu bildirin; Tarodan destek ekibi sipariş, ödeme, hesap ve teknik konularda en kısa sürede yardımcı olsun.",
    alternates: localizedCanonical(locale, "/support"),
  };
}

export default function SupportPage() {
  return <SupportClient />;
}

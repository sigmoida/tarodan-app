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
    title: "Yardım & Destek · Tarodan",
    description:
      "Tarodan yardım konuları, sıkça sorulan sorular ve destek talebi oluşturma: sipariş, ödeme, hesap, takas ve teknik konularda yardım alın.",
    alternates: localizedCanonical(locale, "/support"),
  };
}

export default function SupportPage() {
  return <SupportClient />;
}

/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import ReturnsExchangesClient from "./_components/ReturnsExchangesClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "İade ve Değişim · Tarodan",
    description:
      "Tarodan iade ve değişim politikası, iade adımları ve iade süreleri hakkında bilmeniz gereken her şey.",
    alternates: localizedCanonical(locale, "/returns-exchanges"),
  };
}

export default function ReturnsExchangesPage() {
  return <ReturnsExchangesClient />;
}

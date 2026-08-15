/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import SellClient from "./_components/SellClient";
import { getTranslations } from "next-intl/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return {
    title: t("page.sell.page.buradaSatisYapinTarodan"),
    description: t(
      "page.sell.page.modelArabaKoleksiyonunuzuTarodanUzerindeSatisa",
    ),
    alternates: localizedCanonical(locale, "/sell"),
  };
}

export default function SellPage() {
  return <SellClient />;
}

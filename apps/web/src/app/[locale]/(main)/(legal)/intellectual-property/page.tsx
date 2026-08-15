/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import IntellectualPropertyClient from "./_components/IntellectualPropertyClient";
import { getTranslations } from "next-intl/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return {
    title: t("page.intellectualProperty.page.fikriMulkiyetTarodan"),
    description: t(
      "page.intellectualProperty.page.tarodanFikriMulkiyetPolitikasiTelifHakki",
    ),
    alternates: localizedCanonical(locale, "/intellectual-property"),
  };
}

export default function IntellectualPropertyPage() {
  return <IntellectualPropertyClient />;
}

/** @format */

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { localizedCanonical } from "@/lib/seo";
import { LegalDocument } from "@/components/legal/LegalDocument";
import { distanceSalesParts } from "./_lib/contract";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return {
    title: t("legal.distanceSales.metaTitle"),
    description: t("legal.distanceSales.metaDescription"),
    alternates: localizedCanonical(locale, "/distance-sales"),
  };
}

export default async function DistanceSalesPage() {
  const t = await getTranslations();
  return (
    <LegalDocument
      title={t("legal.distanceSalesTitle")}
      description={t("legal.distanceSales.pageDescription")}
      parts={distanceSalesParts(t)}
      footer={t("legal.distanceSales.pageFooter")}
    />
  );
}

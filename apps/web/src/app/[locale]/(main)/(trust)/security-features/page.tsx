/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import SecurityFeaturesClient from "./_components/SecurityFeaturesClient";
import { getTranslations } from "next-intl/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return {
    title: t("page.securityFeatures.page.guvenlikVeGizlilikTarodan"),
    description: t(
      "page.securityFeatures.page.tarodanGuvenlikOnlemleriAliciKorumasiVe",
    ),
    alternates: localizedCanonical(locale, "/security-features"),
  };
}

export default function SecurityFeaturesPage() {
  return <SecurityFeaturesClient />;
}

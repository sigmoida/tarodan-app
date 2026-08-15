/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import AuthenticityClient from "./_components/AuthenticityClient";
import { getTranslations } from "next-intl/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return {
    title: t("page.authenticity.page.orijinallikGarantisiTarodan"),
    description: t(
      "page.authenticity.page.tarodanDogrulamaSureciSahtecilikOnlemleriVe",
    ),
    alternates: localizedCanonical(locale, "/authenticity"),
  };
}

export default function AuthenticityPage() {
  return <AuthenticityClient />;
}

/** @format */

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { localizedCanonical } from "@/lib/seo";
import SupportClient from "./_components/SupportClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return {
    title: t("support.metaTitle"),
    description: t("support.metaDescription"),
    alternates: localizedCanonical(locale, "/support"),
  };
}

export default function SupportPage() {
  return <SupportClient />;
}

/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import CookiesClient from "./_components/CookiesClient";
import { getTranslations } from "next-intl/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return {
    title: t("page.cookies.page.cerezPolitikasiTarodan"),
    description: t(
      "page.cookies.page.tarodanCerezPolitikasiHangiCerezleriNeden",
    ),
    alternates: localizedCanonical(locale, "/cookies"),
  };
}

export default function CookiesPage() {
  return <CookiesClient />;
}

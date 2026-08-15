/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import BuyerProtectionClient from "./_components/BuyerProtectionClient";
import { getTranslations } from "next-intl/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return {
    title: t("page.buyerProtection.page.aliciKorumaTarodan"),
    description: t(
      "page.buyerProtection.page.tarodanAliciKorumaProgramiKapsamPara",
    ),
    alternates: localizedCanonical(locale, "/buyer-protection"),
  };
}

export default function BuyerProtectionPage() {
  return <BuyerProtectionClient />;
}

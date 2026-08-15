/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import SellerAgreementClient from "./_components/SellerAgreementClient";
import { getTranslations } from "next-intl/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return {
    title: t("page.sellerAgreement.page.saticiSozlesmeleriTarodan"),
    description: t(
      "page.sellerAgreement.page.tarodanBireyselVeKurumsalSaticiUyelik",
    ),
    alternates: localizedCanonical(locale, "/seller-agreement"),
  };
}

export default function SellerAgreementPage() {
  return <SellerAgreementClient />;
}

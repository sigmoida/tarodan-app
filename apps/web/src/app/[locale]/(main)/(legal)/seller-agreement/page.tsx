/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import SellerAgreementClient from "./_components/SellerAgreementClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "Satıcı Sözleşmeleri · Tarodan",
    description:
      "Tarodan bireysel ve kurumsal satıcı üyelik ve satış sözleşmeleri: onboarding, listeleme, kargo, güvenli ödeme havuzu, komisyon ve hizmet bedelleri.",
    alternates: localizedCanonical(locale, "/seller-agreement"),
  };
}

export default function SellerAgreementPage() {
  return <SellerAgreementClient />;
}

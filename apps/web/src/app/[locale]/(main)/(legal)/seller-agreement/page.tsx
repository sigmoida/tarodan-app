/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import SellerAgreementClient from "./_components/SellerAgreementClient";

export function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Metadata {
  return {
    title: "Satıcı Sözleşmesi · Tarodan",
    description:
      "TARODAN platformunda satıcı olmanın koşulları, komisyon ve ödemeler, satıcı yükümlülükleri, yasak ürünler ve fesih şartları.",
    alternates: localizedCanonical(locale, "/seller-agreement"),
  };
}

export default function SellerAgreementPage() {
  return <SellerAgreementClient />;
}

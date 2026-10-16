/** @format */

import type { Metadata } from "next";
import { LegalDocContent, legalDocMeta } from "@/components/legal/documents";
import { localizedCanonical } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    ...(await legalDocMeta("seller-agreement", locale)),
    alternates: localizedCanonical(locale, "/seller-agreement"),
  };
}

export default function SellerAgreementPage() {
  return <LegalDocContent doc="seller-agreement" />;
}

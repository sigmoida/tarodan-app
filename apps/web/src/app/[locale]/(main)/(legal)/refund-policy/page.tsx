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
    ...(await legalDocMeta("refund-policy", locale)),
    alternates: localizedCanonical(locale, "/refund-policy"),
  };
}

export default function RefundPolicyPage() {
  return <LegalDocContent doc="refund-policy" />;
}

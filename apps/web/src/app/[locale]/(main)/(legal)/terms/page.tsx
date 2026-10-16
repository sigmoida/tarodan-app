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
    ...(await legalDocMeta("terms", locale)),
    alternates: localizedCanonical(locale, "/terms"),
  };
}

export default function TermsPage() {
  return <LegalDocContent doc="terms" />;
}

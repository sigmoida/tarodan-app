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
    ...(await legalDocMeta("cookies", locale)),
    alternates: localizedCanonical(locale, "/cookies"),
  };
}

export default function CookiesPage() {
  return <LegalDocContent doc="cookies" />;
}

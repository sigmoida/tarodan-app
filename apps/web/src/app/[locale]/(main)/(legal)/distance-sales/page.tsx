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
    ...(await legalDocMeta("distance-sales", locale)),
    alternates: localizedCanonical(locale, "/distance-sales"),
  };
}

export default function DistanceSalesPage() {
  return <LegalDocContent doc="distance-sales" />;
}

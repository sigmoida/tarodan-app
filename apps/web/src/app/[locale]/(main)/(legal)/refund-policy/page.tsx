/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import RefundPolicyClient from "./_components/RefundPolicyClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "İade Politikası · Tarodan",
    description:
      "Tarodan iade ve iptal koşulları: talep oluşturma adımları, değerlendirme süreci, kargo ücretinin kime ait olduğu ve ücret iadesi süreleri.",
    alternates: localizedCanonical(locale, "/refund-policy"),
  };
}

export default function RefundPolicyPage() {
  return <RefundPolicyClient />;
}

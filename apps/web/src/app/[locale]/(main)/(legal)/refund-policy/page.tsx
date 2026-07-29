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
      "TARODAN iade ve cayma hakkı koşulları: iade süreci, süreler, ödeme iadesi ve mesafeli satış kapsamındaki tüketici hakları.",
    alternates: localizedCanonical(locale, "/refund-policy"),
  };
}

export default function RefundPolicyPage() {
  return <RefundPolicyClient />;
}

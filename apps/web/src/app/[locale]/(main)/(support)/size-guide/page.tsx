/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import SizeGuideClient from "./_components/SizeGuideClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "Ölçek Rehberi · Tarodan",
    description:
      "Model araba ölçekleri kılavuzu: 1:18, 1:24, 1:43 ve 1:64 ölçeklerinin yaklaşık boyutları ve notları.",
    alternates: localizedCanonical(locale, "/size-guide"),
  };
}

export default function SizeGuidePage() {
  return <SizeGuideClient />;
}

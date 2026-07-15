/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import SecurityFeaturesClient from "./_components/SecurityFeaturesClient";

export function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Metadata {
  return {
    title: "Güvenlik ve Gizlilik · Tarodan",
    description:
      "Tarodan güvenlik önlemleri, alıcı koruması ve veri gizliliği uygulamaları ile alışverişinizi nasıl güvende tuttuğunu açıklar.",
    alternates: localizedCanonical(locale, "/security-features"),
  };
}

export default function SecurityFeaturesPage() {
  return <SecurityFeaturesClient />;
}

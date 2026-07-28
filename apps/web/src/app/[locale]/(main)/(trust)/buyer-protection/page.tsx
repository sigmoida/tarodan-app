/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import BuyerProtectionClient from "./_components/BuyerProtectionClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "Alıcı Koruma · Tarodan",
    description:
      "TARODAN Alıcı Koruma programı; kapsam, para iadesi, anlaşmazlık çözümü ve haklarınızı özetler.",
    alternates: localizedCanonical(locale, "/buyer-protection"),
  };
}

export default function BuyerProtectionPage() {
  return <BuyerProtectionClient />;
}

/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import BuyerProtectionClient from "./_components/BuyerProtectionClient";

export function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Metadata {
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

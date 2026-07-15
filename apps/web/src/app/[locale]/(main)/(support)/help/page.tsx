/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import HelpClient from "./_components/HelpClient";

export function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Metadata {
  return {
    title: "Yardım Merkezi · Tarodan",
    description:
      "TARODAN yardım merkezi: alışveriş, satış, takas, kargo, güvenlik ve hesap konularında hızlı yanıtlar ve destek.",
    alternates: localizedCanonical(locale, "/help"),
  };
}

export default function HelpCenterPage() {
  return <HelpClient />;
}

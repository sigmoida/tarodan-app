/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import GuidesClient from "./_components/GuidesClient";

export function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Metadata {
  return {
    title: "Kullanım Kılavuzları · Tarodan",
    description:
      "TARODAN kullanım kılavuzları: üyelik, alışveriş, satış, takas, fotoğraf ve kargo süreçleri için adım adım rehberler.",
    alternates: localizedCanonical(locale, "/guides"),
  };
}

export default function GuidesPage() {
  return <GuidesClient />;
}

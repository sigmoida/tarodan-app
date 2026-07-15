/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import DistanceSalesClient from "./_components/DistanceSalesClient";

export function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Metadata {
  return {
    title: "Mesafeli Satış Sözleşmesi · Tarodan",
    description:
      "TARODAN mesafeli satış sözleşmesi: taraflar, sözleşme konusu ürün, teslimat, cayma hakkı, uyuşmazlık ve yürürlük hükümleri.",
    alternates: localizedCanonical(locale, "/distance-sales"),
  };
}

export default function DistanceSalesPage() {
  return <DistanceSalesClient />;
}

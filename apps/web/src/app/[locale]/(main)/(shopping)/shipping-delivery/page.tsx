/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import ShippingDeliveryClient from "./_components/ShippingDeliveryClient";

export function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Metadata {
  return {
    title: "Kargo ve Teslimat · Tarodan",
    description:
      "Tarodan kargo yöntemleri, kargo ücretleri, teslimat süreleri ve sipariş takibi hakkında bilmeniz gerekenler.",
    alternates: localizedCanonical(locale, "/shipping-delivery"),
  };
}

export default function ShippingDeliveryPage() {
  return <ShippingDeliveryClient />;
}

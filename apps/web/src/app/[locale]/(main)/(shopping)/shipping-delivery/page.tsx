/** @format */

import type { Metadata } from "next";
import ShippingDeliveryClient from "./_components/ShippingDeliveryClient";

export const metadata: Metadata = {
  title: "Kargo ve Teslimat · Tarodan",
  description:
    "Tarodan kargo yöntemleri, kargo ücretleri, teslimat süreleri ve sipariş takibi hakkında bilmeniz gerekenler.",
  alternates: { canonical: "/shipping-delivery" },
};

export default function ShippingDeliveryPage() {
  return <ShippingDeliveryClient />;
}

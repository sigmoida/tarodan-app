/** @format */

import type { Metadata } from "next";
import { DocUnderRevision } from "@/components/layout/DocUnderRevision";

/** İçerik yenilenene kadar "Güncelleniyor" yer tutucusu gösterilir. */
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Kargo ve Teslimat · Tarodan",
    description: "Tarodan kargo ve teslimat bilgileri güncellenmektedir.",
    robots: { index: false },
  };
}

export default function ShippingDeliveryPage() {
  return <DocUnderRevision title="Kargo ve Teslimat" />;
}

/** @format */

import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/LegalDocument";
import { localizedCanonical } from "@/lib/seo";
import { SHIPPING_DELIVERY_PARTS } from "./_lib/shipping-delivery";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "Kargo ve Teslimat · Tarodan",
    description:
      "Tarodan sipariş ve takaslarında kargo ücretinin hesaplanması, hazırlama süresi, Sürat Kargo takibi, teslimat, hasar ve iade gönderileri.",
    alternates: localizedCanonical(locale, "/shipping-delivery"),
  };
}

export default function ShippingDeliveryPage() {
  return (
    <LegalDocument
      title="Kargo ve Teslimat"
      description="Sipariş ve takas gönderilerinde ücret, hazırlama, taşıma, takip, teslimat ve iade süreci."
      parts={SHIPPING_DELIVERY_PARTS}
      footer="Son güncelleme: 5 Ağustos 2026. Taşıyıcı, tarife veya operasyon akışı değiştiğinde bu politika güncellenir. İşleme özel sipariş/takas özeti ve emredici mevzuat hükümleri saklıdır."
    />
  );
}

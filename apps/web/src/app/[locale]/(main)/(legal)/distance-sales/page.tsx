/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import { LegalDocument } from "@/components/legal/LegalDocument";
import { DISTANCE_SALES_PARTS } from "./_lib/contract";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "Mesafeli Satış Sözleşmesi · Tarodan",
    description:
      "Tarodan ön bilgilendirme formu ve mesafeli satış sözleşmesi: taraflar, toplam bedel, teslimat, 14 günlük cayma hakkı, ayıplı mal ve uyuşmazlık çözümü.",
    alternates: localizedCanonical(locale, "/distance-sales"),
  };
}

export default function DistanceSalesPage() {
  return (
    <LegalDocument
      title="Mesafeli Satış Sözleşmesi"
      description="Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi (pazar yeri / aracı hizmet sağlayıcı modeli)."
      parts={DISTANCE_SALES_PARTS}
      footer="Bu metin genel sözleşme metnidir. Siparişinize özel bilgiler (ürün, tutar, taraf ve teslimat bilgileri) sipariş özeti ekranında ve sipariş onay e-postanızda yer alır; sözleşmenin siparişinize işlenmiş haline Hesabım → Siparişlerim alanından erişebilirsiniz."
    />
  );
}

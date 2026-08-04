/** @format */

import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/LegalDocument";
import { localizedCanonical } from "@/lib/seo";
import { TERMS_PARTS } from "./_lib/terms";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "Kullanım Koşulları · Tarodan",
    description:
      "Tarodan üyelik, ilan, satış, satın alma, teklif, takas, ödeme, komisyon, içerik ve hesap kullanım koşulları.",
    alternates: localizedCanonical(locale, "/terms"),
  };
}

export default function TermsPage() {
  return (
    <LegalDocument
      title="Kullanım Koşulları"
      description="Tarodan pazar yerini ziyaret ederken, üyelik oluştururken, ilan verirken, satın alırken veya takas yaparken geçerli genel kurallar."
      parts={TERMS_PARTS}
      footer="Yürürlük ve son güncelleme: 5 Ağustos 2026. Bu metnin güncel sürümüne Platform üzerinden sürekli erişilebilir. İşleme özel olarak onaylanan sözleşmeler ve emredici mevzuat hükümleri saklıdır."
    />
  );
}

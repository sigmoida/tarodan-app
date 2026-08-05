/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import { LegalDocument } from "@/components/legal/LegalDocument";
import { PRIVACY_PARTS } from "./_lib/privacy";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "Gizlilik Politikası · Tarodan",
    description:
      "Tarodan KVKK aydınlatma metni: veri sorumlusu, işlenen veri kategorileri, işleme amaçları, aktarım, ilgili kişinin hakları ve başvuru yöntemi.",
    alternates: localizedCanonical(locale, "/privacy"),
  };
}

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Gizlilik Politikası"
      description="Kişisel verilerinizin hangi amaçlarla işlendiği, kimlere aktarıldığı ve haklarınızı nasıl kullanacağınız."
      parts={PRIVACY_PARTS}
      footer="Çerezler bakımından Çerez Politikası uygulanır. Bu metin, mevzuat ve uygulama değişikliklerine göre güncellenebilir; güncel metin Platform'da yayımlanır."
    />
  );
}

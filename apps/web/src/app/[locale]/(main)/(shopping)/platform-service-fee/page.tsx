/** @format */

import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { DocPage } from "@/components/layout/DocPage";
import SectionCard from "@/components/ui/SectionCard";
import { localizedCanonical } from "@/lib/seo";

export function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Metadata {
  return {
    title: "Platform Hizmet Bedeli · Tarodan",
    description:
      "TARODAN Platform Hizmet Bedeli nedir, nasıl hesaplanır, nereye gider ve iade durumunda ne olur? Şeffaf ücretlendirme hakkında bilmeniz gerekenler.",
    alternates: localizedCanonical(locale, "/platform-service-fee"),
  };
}

export default function PlatformHizmetBedeliPage() {
  return (
    <DocPage
      title="Platform Hizmet Bedeli"
      description="Son güncelleme: 2 Haziran 2026"
    >
      <SectionCard>
        <div className="prose prose-gray max-w-none">
          <h2>1. Nedir?</h2>
          <p>
            Platform Hizmet Bedeli, TARODAN üzerinden yaptığınız her satın
            almada ürün bedelinin <strong>%3'ü oranında</strong> alınan bir
            hizmet ücretidir. Bu bedel, ödeme altyapısı, güvenli alışveriş
            garantisi, uyuşmazlık çözümü ve platform üzerinde sunduğumuz diğer
            hizmetler için kullanılır.
          </p>

          <h2>2. Hesaplama Yöntemi</h2>
          <ul>
            <li>
              <strong>Baz tutar:</strong> Sadece ürün fiyatı (kargo bedeli ve
              indirimler hariç).
            </li>
            <li>
              <strong>Oran:</strong> Yürürlükteki oran %3'tür. Bu oran zaman
              içinde değişebilir; değişiklikler bu sayfada duyurulur.
            </li>
            <li>
              <strong>KDV:</strong> Tutara KDV dahildir; ayrıca KDV eklenmez.
            </li>
          </ul>

          <p>
            Örnek: 500 TL'lik bir ürün satın alırsanız Platform Hizmet Bedeli
            <strong> 15 TL</strong> olur ve sepet toplamına dahil edilir.
          </p>

          <h2>3. Nereye Gider?</h2>
          <p>
            Platform Hizmet Bedeli TARODAN'a gelir olarak kaydedilir ve
            aşağıdaki maliyetlerin karşılanmasında kullanılır:
          </p>
          <ul>
            <li>Ödeme sağlayıcısı (PayTR) işlem komisyonu</li>
            <li>SSL sertifikası, güvenlik altyapısı, fraud önleme</li>
            <li>Müşteri desteği ve uyuşmazlık çözümü</li>
            <li>Platform geliştirme ve teknik bakım</li>
          </ul>

          <h2>4. İade Durumunda Ne Olur?</h2>
          <p>
            Platform Hizmet Bedeli'nin iade edilip edilmeyeceği iadenin
            gerekçesine bağlıdır:
          </p>
          <ul>
            <li>
              <strong>Satıcı kaynaklı iade</strong> (hasarlı, eksik, yanlış
              ürün, sahte vb.): Platform Hizmet Bedeli{" "}
              <strong>tamamen iade edilir</strong>.
            </li>
            <li>
              <strong>Satıcı göndermediği için iptal:</strong> Platform Hizmet
              Bedeli tamamen iade edilir.
            </li>
            <li>
              <strong>Alıcı fikir değişikliği (Senaryo D):</strong> Platform
              Hizmet Bedeli <strong>iade edilmez</strong> — çünkü iadeye konu
              olmayan hizmetler verilmiştir (ödeme işlem, güvenlik vs.).
            </li>
            <li>
              <strong>48 saat onay süreci dolduktan sonra:</strong> Sipariş
              tamamlanmış sayılır, Platform Hizmet Bedeli kesinleşir.
            </li>
          </ul>

          <h2>5. Şeffaflık</h2>
          <p>
            Sepet ve checkout sayfalarında Platform Hizmet Bedeli{" "}
            <strong>ayrı bir satır</strong> olarak gösterilir. Ödemenizden önce
            tutarı net olarak görebilirsiniz. Ek ücret veya gizli bedel
            uygulanmaz.
          </p>

          <h2>6. Sorularınız İçin</h2>
          <p>
            Platform Hizmet Bedeli hakkında daha fazla bilgi için{" "}
            <Link href="/help" className="text-primary-600 underline">
              Yardım Merkezi
            </Link>
            'ni ziyaret edebilir veya{" "}
            <a
              href="mailto:destek@tarodan.com"
              className="text-primary-600 underline"
            >
              destek@tarodan.com
            </a>{" "}
            adresinden bize ulaşabilirsiniz.
          </p>

          <p className="text-sm text-muted mt-8">
            Bu sayfa bilgilendirme amaçlıdır; bağlayıcı sözleşme şartları için{" "}
            <Link href="/terms" className="text-primary-600 underline">
              Kullanım Koşulları
            </Link>{" "}
            ve{" "}
            <Link href="/refund-policy" className="text-primary-600 underline">
              İade Politikası
            </Link>{" "}
            sayfalarımızı inceleyiniz.
          </p>
        </div>
      </SectionCard>
    </DocPage>
  );
}

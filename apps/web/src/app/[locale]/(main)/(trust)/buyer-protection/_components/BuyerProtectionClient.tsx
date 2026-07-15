"use client";

import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { DocPage } from "@/components/layout/DocPage";
import SectionCard from "@/components/ui/SectionCard";

export default function BuyerProtectionClient() {
  const t = useTranslations();

  return (
    <DocPage
      title={t("legal.buyerProtectionTitle")}
      description={`${t("legal.lastUpdated")}: 24 Ocak 2026`}
    >
      <SectionCard>
        <div className="prose prose-gray max-w-none">
          <h2>1. Alıcı Koruma Nedir?</h2>
          <p>
            TARODAN Alıcı Koruma programı, platform üzerinden yaptığınız
            alışverişlerde ürünün tanıma uygun gelmemesi, hiç gönderilmemesi
            veya ciddi anlaşmazlık durumlarında inceleme ve gerekirse para
            iadesi süreçlerini kapsar. Bu sayfa, haklarınızı ve başvuru sürecini
            özetler.
          </p>

          <h2>2. Kapsam</h2>
          <ul>
            <li>
              Platformda ödeme alınan (güvenli ödeme ile tamamlanan) siparişler
            </li>
            <li>Ürün hiç kargolanmadı veya takip bilgisi verilmedi</li>
            <li>
              Ürün açıklamaya ciddi şekilde aykırı (yanlış model, ölçek, ağır
              hasar)
            </li>
            <li>Sahte veya taklit ürün iddiası</li>
          </ul>
          <p>
            Cayma hakkı ve standart iade koşulları için{" "}
            <Link
              href="/refund-policy"
              className="text-primary-500 hover:underline"
            >
              İade Politikası
            </Link>{" "}
            ve{" "}
            <Link
              href="/returns-exchanges"
              className="text-primary-500 hover:underline"
            >
              İade ve Değişim
            </Link>{" "}
            sayfalarına bakınız.
          </p>

          <h2>3. Para İadesi / Para İade Garantisi</h2>
          <p>
            Uygun koşullarda ve inceleme sonucunda, ödeme satıcıya ulaşmadan
            önce iade edilebilir veya anlaşmazlık çözümüne göre alıcı lehine
            para iadesi yapılabilir. "Para iade garantisi" ifadesi, platformun
            belirlediği kurallar ve süreçler çerçevesinde sunulan korumayı ifade
            eder; her durumda otomatik iade anlamına gelmez.
          </p>

          <h2>4. Anlaşmazlık Çözümü</h2>
          <ol>
            <li>
              <strong>Satıcı ile iletişim:</strong> Önce sipariş/mesajlar
              üzerinden satıcıyla iletişime geçin.
            </li>
            <li>
              <strong>Destek talebi:</strong> Çözülemezse Hesabım → Siparişlerim
              → İlgili sipariş → "Sorun bildir" veya destek@tarodan.com.
            </li>
            <li>
              <strong>İnceleme:</strong> Destek ekibimiz talebi ve (varsa)
              kanıtları inceler; gerekirse satıcıdan bilgi alır.
            </li>
            <li>
              <strong>Karar ve uygulama:</strong> Sonuç (iade, kısmi iade, red)
              size ve gerekirse satıcıya bildirilir; ödeme süreçleri buna göre
              işletilir.
            </li>
          </ol>
          <p>
            Süre: Başvurular genellikle 5–10 iş günü içinde incelenir; karmaşık
            durumlarda süre uzayabilir.
          </p>

          <h2>5. Sizin Yapmanız Gerekenler</h2>
          <ul>
            <li>Siparişi ve varsa hasar/uyumsuzluk fotoğraflarını saklamak</li>
            <li>Kargo takip bilgisi ve iletişim geçmişini paylaşmak</li>
            <li>Talep açıklamasını net ve doğru yazmak</li>
            <li>Platform iletişimlerine zamanında cevap vermek</li>
          </ul>

          <h2>6. Sınırlamalar</h2>
          <p>
            Alıcı koruma, yasal tüketici haklarınızın yerine geçmez; onlara ek
            olarak sunulur. Belirli kampanya veya satıcı koşulları farklı
            olabilir; yine de zorunlu yasal haklarınız saklıdır.
          </p>

          <h2>7. İletişim</h2>
          <p>destek@tarodan.com – konu: "Alıcı Koruma – Sipariş No"</p>
        </div>

        <div className="mt-8 flex flex-wrap gap-4">
          <Link
            href="/refund-policy"
            className="text-primary-500 hover:underline"
          >
            İade Politikası →
          </Link>
          <Link
            href="/returns-exchanges"
            className="text-primary-500 hover:underline"
          >
            İade ve Değişim →
          </Link>
          <Link href="/terms" className="text-primary-500 hover:underline">
            Kullanım Şartları →
          </Link>
        </div>
      </SectionCard>
    </DocPage>
  );
}

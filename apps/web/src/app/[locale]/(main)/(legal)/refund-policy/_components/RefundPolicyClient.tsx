"use client";

import { Link } from "@/i18n/navigation";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { useLocale, useTranslations } from "next-intl";
import { DocPage } from "@/components/layout/DocPage";
import SectionCard from "@/components/ui/SectionCard";

export default function RefundPolicyClient() {
  const t = useTranslations();

  return (
    <DocPage
      title={t("legal.refundPolicyTitle")}
      description={`${t("legal.lastUpdated")}: 24 Ocak 2026`}
    >
      <SectionCard>
        <div className="prose prose-gray max-w-none">
          <h2>1. Giriş</h2>
          <p>
            Bu İade Politikası, TARODAN platformu üzerinden yapılan
            alışverişlerde iade koşullarını, sürecini ve istisnaları düzenler.
            6502 sayılı Tüketicilerin Korunması Hakkında Kanun ve Mesafeli
            Sözleşmeler Yönetmeliği kapsamında cayma hakkı ve iade işlemleri bu
            politika ile uyumludur.
          </p>

          <h2>2. Cayma Hakkı (Mesafeli Satış)</h2>
          <p>
            Tüketici, ürünü teslim aldığı tarihten itibaren{" "}
            <strong>14 gün</strong> içinde herhangi bir gerekçe göstermeksizin
            ve cezai şart ödemeksizin sözleşmeden cayma hakkına sahiptir. Cayma
            hakkının kullanılması için bu süre içinde platform üzerinden veya
            kvkk@tarodan.com adresine yazılı bildirim yapılması gerekir.
          </p>

          <h2>3. İade Koşulları</h2>
          <h3>3.1 İade Kabul Edilen Durumlar</h3>
          <ul>
            <li>14 günlük cayma hakkı süresi içinde yapılan başvurular</li>
            <li>Yanlış, hasarlı veya eksik ürün teslimatı</li>
            <li>
              Ürünün tanımına aykırılık (yanlış model, ölçek veya açıklama)
            </li>
            <li>Satıcı tarafından iptal edilen siparişler</li>
          </ul>

          <h3>3.2 İade Kabul Edilmeyen Durumlar</h3>
          <ul>
            <li>
              Kullanılmış, ambalajı açılmış veya koleksiyon değerini yitirmiş
              ürünler (cayma hakkı hariç)
            </li>
            <li>Kişiye özel sipariş edilen ürünler</li>
            <li>
              Fırsat/indirimle satılan ve "iade kabul edilmez" ibaresi taşıyan
              ilanlar (yasal zorunluluklar saklı)
            </li>
          </ul>

          <h2>4. İade Süreci</h2>
          <ol>
            <li>
              Hesabım → Siparişlerim üzerinden ilgili siparişte "İade Talebi"
              oluşturun.
            </li>
            <li>
              Talep onaylandıktan sonra ürünü orijinal ambalajında, hasarsız
              şekilde kargo ile iade edin.
            </li>
            <li>Kargo takip numarasını platforma girin.</li>
            <li>
              Ürün satıcıya ulaştığında kontrol yapılır; uygunluk halinde ödeme
              14 iş günü içinde iade edilir.
            </li>
          </ol>

          <h2>5. İade Süresi ve Ödeme</h2>
          <p>
            İade edilen tutar, ödemenin yapıldığı ödeme yöntemine (kredi kartı,
            havale vb.)
            <strong>14 iş günü</strong> içinde yansıtılır. Banka ve kart şirketi
            işlem süreleri ek gecikmeye neden olabilir. Kargo ücreti cayma hakkı
            kullanımında tüketiciye aittir; hatalı/eksik ürün durumunda kargo
            masrafı satıcı/platform tarafından karşılanır.
          </p>

          <h2>6. Marketplace (Satıcıdan Alım) Farkları</h2>
          <p>
            Platformda satıcılar kendi ürünlerini satar. İade koşulları ve ek
            kurallar satıcı ilanında belirtilebilir; ancak yasal cayma hakkı ve
            tüketici hakları saklıdır. Anlaşmazlık durumunda Alıcı Koruma
            politikamız ve destek ekibimiz devreye girer.
          </p>

          <h2>7. İletişim</h2>
          <p>İade talepleriniz ve sorularınız için:</p>
          <ul>
            <li>
              <strong>E-posta:</strong> destek@tarodan.com.tr
            </li>
            <li>
              <strong>Konu:</strong> İade Talebi – Sipariş No
            </li>
          </ul>
        </div>
      </SectionCard>

      <div className="flex flex-wrap gap-4">
        <Link
          href="/terms"
          className="inline-flex items-center text-primary-500 hover:underline"
        >
          Kullanım Şartları
          <ChevronRightIcon className="ml-1 h-4 w-4" />
        </Link>
        <Link
          href="/returns-exchanges"
          className="inline-flex items-center text-primary-500 hover:underline"
        >
          İade ve Değişim (Bilgi)
          <ChevronRightIcon className="ml-1 h-4 w-4" />
        </Link>
        <Link
          href="/buyer-protection"
          className="inline-flex items-center text-primary-500 hover:underline"
        >
          Alıcı Koruma
          <ChevronRightIcon className="ml-1 h-4 w-4" />
        </Link>
      </div>
    </DocPage>
  );
}

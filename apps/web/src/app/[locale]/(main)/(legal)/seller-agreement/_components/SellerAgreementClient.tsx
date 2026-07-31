"use client";

import { Link } from "@/i18n/navigation";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { useLocale, useTranslations } from "next-intl";
import { DocPage } from "@/components/layout/DocPage";
import SectionCard from "@/components/ui/SectionCard";

export default function SellerAgreementClient() {
  const t = useTranslations();

  return (
    <DocPage
      title={t("legal.sellerAgreementTitle")}
      description={`${t("legal.lastUpdated")}: 24 Ocak 2026`}
    >
      <SectionCard>
        <div className="prose prose-gray max-w-none">
          <h2>1. Giriş ve Kapsam</h2>
          <p>
            Bu Satıcı Sözleşmesi ("Sözleşme"), TARODAN platformunda satıcı
            olarak ürün satmak isteyen gerçek veya tüzel kişiler ile TARODAN
            Teknoloji A.Ş. ("Platform") arasındaki ilişkiyi düzenler. Platformda
            satış yapmaya başlamadan önce bu sözleşmeyi ve Kullanım Şartlarını
            kabul etmeniz gerekir.
          </p>

          <h2>2. Satıcı Olma Koşulları</h2>
          <ul>
            <li>18 yaşını doldurmuş olmak veya yasal temsilci onayı</li>
            <li>Gerçek ve güncel kimlik ve iletişim bilgileri vermek</li>
            <li>
              Türkiye Cumhuriyeti mevzuatına uygun ticari faaliyet (gerekirse
              vergi kimlik bilgisi)
            </li>
            <li>Platformun satıcı kayıt ve doğrulama sürecini tamamlamak</li>
          </ul>

          <h2>3. Komisyon ve Ödemeler</h2>
          <p>
            Satışlardan platform komisyonu kesilir. Güncel komisyon oranları ve
            ödeme periyotları satıcı panelinde ve üyelik/pricing sayfalarında
            ilan edilir. Komisyon oranları önceden bildirilmek kaydıyla
            güncellenebilir. Satıcı ödemeleri, onaylanan siparişler ve iade
            süreleri dikkate alınarak belirlenen takvimde hesabınıza aktarılır.
          </p>

          <h2>4. Satıcı Yükümlülükleri</h2>
          <ul>
            <li>
              Ürün bilgilerini doğru, eksiksiz ve yanıltıcı olmayacak şekilde
              girmek
            </li>
            <li>
              Gerçek ve net fotoğraflar kullanmak; stok durumunu güncel tutmak
            </li>
            <li>Ödenen siparişleri belirtilen süre içinde kargoya vermek</li>
            <li>
              Mesafeli satış ve tüketici mevzuatına uymak (cayma hakkı, iade
              koşulları)
            </li>
            <li>Alıcı ile iletişimde kibar ve profesyonel olmak</li>
            <li>Platform kurallarına ve yasak ürün listesine uymak</li>
          </ul>

          <h2>5. Yasak Ürünler ve İçerik</h2>
          <p>Aşağıdaki ürünlerin satışı veya tanıtımı yasaktır:</p>
          <ul>
            <li>Sahte veya taklit ürünler</li>
            <li>Telif hakkı veya marka ihlali oluşturan materyaller</li>
            <li>Yasalara aykırı veya tehlikeli maddeler</li>
            <li>
              Platformun "diecast / model araba" kapsamı dışındaki, izinsiz
              kategoriler
            </li>
            <li>Yanıltıcı, spam veya uygunsuz liste açıklamaları</li>
          </ul>
          <p>
            İhlal tespitinde ilan kaldırılır; tekrarlayan ihlallerde hesap
            askıya alınabilir veya sözleşme feshedilir.
          </p>

          <h2>6. Hesap Askıya Alma ve Fesih</h2>
          <p>
            Platform, aşağıdaki durumlarda satıcı hesabını askıya alabilir veya
            sözleşmeyi feshedebilir: sözleşme ihlali, şikayetlerin
            tekrarlanması, dolandırıcılık şüphesi, yasal zorunluluk veya
            platform güvenliği. Askıya alma öncesi (mümkünse) bildirim yapılır;
            acil durumlarda önce askıya alınıp sonra bilgilendirme yapılabilir.
          </p>

          <h2>7. Fikri Mülkiyet ve Lisans</h2>
          <p>
            Satıcı, yüklediği metin ve görsellerin kullanım hakkına sahip
            olduğunu beyan eder. Platforma yüklenen içerikler için, pazarlama ve
            platform işleyişi amacıyla sınırlı bir lisans verilmiş kabul edilir.
            Detaylar için{" "}
            <Link
              href="/intellectual-property"
              className="inline-flex items-center text-primary-500 hover:underline"
            >
              Fikri Mülkiyet
            </Link>{" "}
            sayfamıza bakınız.
          </p>

          <h2>8. İletişim</h2>
          <p>
            Satıcı sözleşmesi ve satıcı hesabı ile ilgili: satıcı@tarodan.com
          </p>
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
          href="/sell"
          className="inline-flex items-center text-primary-500 hover:underline"
        >
          Satışa Başla
          <ChevronRightIcon className="ml-1 h-4 w-4" />
        </Link>
      </div>
    </DocPage>
  );
}

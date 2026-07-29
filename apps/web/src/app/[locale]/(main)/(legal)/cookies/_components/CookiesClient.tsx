import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { DocPage } from "@/components/layout/DocPage";
import SectionCard from "@/components/ui/SectionCard";
import CookiePreferencesPanel from "./CookiePreferencesPanel";

const DOC_LINKS = [
  { href: "/terms", label: "Kullanım Şartları" },
  { href: "/privacy", label: "Gizlilik Politikası" },
  { href: "/distance-sales", label: "Mesafeli Satış Sözleşmesi" },
];

export default async function CookiesClient() {
  const t = await getTranslations();

  return (
    <DocPage
      title={t("legal.cookiesTitle")}
      description={`${t("legal.lastUpdated")}: 24 Ocak 2026`}
    >
      {/* Intro */}
      <SectionCard>
        <div className="prose prose-gray max-w-none">
          <h2>1. Çerez Nedir?</h2>
          <p>
            Çerezler, web siteleri tarafından cihazınıza yerleştirilen küçük
            metin dosyalarıdır. Bu dosyalar, sizi tanımamıza, tercihlerinizi
            hatırlamamıza ve size daha iyi bir deneyim sunmamıza yardımcı olur.
          </p>

          <h2>2. Neden Çerez Kullanıyoruz?</h2>
          <ul>
            <li>Platformun düzgün çalışmasını sağlamak</li>
            <li>Oturumunuzu güvenli tutmak</li>
            <li>Tercihlerinizi hatırlamak</li>
            <li>Alışveriş sepetinizi korumak</li>
            <li>Platformu nasıl kullandığınızı anlayıp iyileştirmek</li>
            <li>Size özel içerik ve reklamlar sunmak</li>
          </ul>

          <h2>3. Çerez Türleri</h2>
          <h3>3.1 Süreye Göre</h3>
          <ul>
            <li>
              <strong>Oturum Çerezleri:</strong> Tarayıcınızı kapattığınızda
              otomatik olarak silinir.
            </li>
            <li>
              <strong>Kalıcı Çerezler:</strong> Belirlenen süre boyunca
              cihazınızda kalır.
            </li>
          </ul>
          <h3>3.2 Kaynağa Göre</h3>
          <ul>
            <li>
              <strong>Birinci Taraf Çerezler:</strong> TARODAN tarafından
              doğrudan yerleştirilir.
            </li>
            <li>
              <strong>Üçüncü Taraf Çerezler:</strong> Hizmet sağlayıcılarımız
              (Google Analytics, Facebook vb.) tarafından yerleştirilir.
            </li>
          </ul>
        </div>
      </SectionCard>

      {/* Preferences */}
      <SectionCard title="4. Çerez Kategorileri ve Tercihler">
        <CookiePreferencesPanel
          saveLabel={t("legal.savePreferences")}
          acceptAllLabel={t("legal.acceptAll")}
        />
      </SectionCard>

      {/* How to control */}
      <SectionCard>
        <div className="prose prose-gray max-w-none">
          <h2>5. Çerezleri Nasıl Kontrol Edebilirsiniz?</h2>
          <h3>5.1 Tarayıcı Ayarları</h3>
          <p>
            Çoğu tarayıcı, çerezleri kontrol etmenize olanak tanır. Tarayıcı
            ayarlarından:
          </p>
          <ul>
            <li>Tüm çerezleri engelleyebilirsiniz</li>
            <li>Yalnızca üçüncü taraf çerezleri engelleyebilirsiniz</li>
            <li>Mevcut çerezleri silebilirsiniz</li>
            <li>Her çerez yerleştirildiğinde uyarı alabilirsiniz</li>
          </ul>
          <h3>5.2 Tarayıcı Bağlantıları</h3>
          <ul>
            <li>
              <a
                href="https://support.google.com/chrome/answer/95647"
                target="_blank"
                rel="noopener noreferrer"
              >
                Google Chrome
              </a>
            </li>
            <li>
              <a
                href="https://support.mozilla.org/tr/kb/cerezleri-etkinlestirme-ve-devre-disi-birakma"
                target="_blank"
                rel="noopener noreferrer"
              >
                Mozilla Firefox
              </a>
            </li>
            <li>
              <a
                href="https://support.apple.com/tr-tr/guide/safari/sfri11471/mac"
                target="_blank"
                rel="noopener noreferrer"
              >
                Apple Safari
              </a>
            </li>
            <li>
              <a
                href="https://support.microsoft.com/tr-tr/microsoft-edge"
                target="_blank"
                rel="noopener noreferrer"
              >
                Microsoft Edge
              </a>
            </li>
          </ul>
          <h3>5.3 Mobil Cihazlar</h3>
          <p>
            Mobil cihazlarda çerez ayarlarını tarayıcı veya cihaz ayarlarından
            yönetebilirsiniz.
          </p>
        </div>

        <div className="mt-4 p-4 bg-warning-50 rounded-lg border border-warning-200">
          <p className="text-sm text-warning-800">
            <strong>Önemli:</strong> Zorunlu çerezleri devre dışı bırakmanız
            halinde platformun bazı özellikleri düzgün çalışmayabilir.
          </p>
        </div>

        <div className="prose prose-gray max-w-none mt-6">
          <h2>6. Üçüncü Taraf Çerezleri</h2>
          <p>Aşağıdaki üçüncü taraf hizmetlerin çerezlerini kullanıyoruz:</p>
          <ul>
            <li>
              <strong>Google Analytics:</strong> Web analizi için (
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
              >
                Gizlilik Politikası
              </a>
              )
            </li>
            <li>
              <strong>Iyzico:</strong> Ödeme işlemleri için (
              <a
                href="https://www.iyzico.com/gizlilik-politikasi"
                target="_blank"
                rel="noopener noreferrer"
              >
                Gizlilik Politikası
              </a>
              )
            </li>
            <li>
              <strong>Facebook Pixel:</strong> Reklam ve analiz için (
              <a
                href="https://www.facebook.com/privacy/explanation"
                target="_blank"
                rel="noopener noreferrer"
              >
                Gizlilik Politikası
              </a>
              )
            </li>
          </ul>

          <h2>7. Politika Güncellemeleri</h2>
          <p>
            Bu politikayı gerektiğinde güncelleyebiliriz. Önemli değişiklikler
            platformda duyurulur ve bu sayfada yayınlanır.
          </p>

          <h2>8. İletişim</h2>
          <p>Çerez politikamız hakkında sorularınız için:</p>
          <ul>
            <li>
              <strong>E-posta:</strong> destek@tarodan.com
            </li>
            <li>
              <strong>Telefon:</strong> 0850 XXX XX XX
            </li>
          </ul>
        </div>
      </SectionCard>

      {/* Related docs */}
      <div className="flex flex-wrap gap-4">
        {DOC_LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="text-sm text-primary-500 hover:underline"
          >
            {l.label} →
          </Link>
        ))}
      </div>
    </DocPage>
  );
}

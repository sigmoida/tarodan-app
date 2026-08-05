import { getTranslations } from "next-intl/server";
import { DocPage } from "@/components/layout/DocPage";
import SectionCard from "@/components/ui/SectionCard";
import CookiePreferencesPanel from "./CookiePreferencesPanel";

/** Saklama süreleri — 5651, KVKK, ETK, VUK ve TTK hükümlerinden. */
const RETENTION = [
  {
    type: "Trafik bilgileri ve erişim logları",
    data: "IP adresi, bağlantı başlangıç/bitiş saatleri, kullanılan portlar, protokoller",
    basis: "5651 sayılı İnternet Kanunu (yer sağlayıcı yükümlülüğü)",
    period: "2 yıl",
  },
  {
    type: "Finansal işlem ve sipariş logları",
    data: "Ödeme hareketleri, sepet geçmişi, faturalar, cüzdan yükleme ve transfer dökümleri",
    basis: "VUK madde 253 ve TTK",
    period: "5 yıl (VUK) / 10 yıl (TTK)",
  },
  {
    type: "Ticari iletişim ve ileti onay logları",
    data: "SMS, e-posta ve arama pazarlama onayları, ret tercihleri, İYS entegrasyon logları",
    basis: "ETK ve Ticari İletişim Yönetmeliği",
    period: "3 yıl (onay kalktıktan sonra)",
  },
  {
    type: "Üyelik, ilan ve iletişim hareketleri",
    data: "İlan verme, mesajlaşma geçmişi, favoriler, arama filtreleri, profil güncellemeleri",
    basis: "6698 sayılı KVKK ve Borçlar Kanunu",
    period: "Üyelik süresince + 10 yıl",
  },
  {
    type: "Çerez rıza ve tercih logları",
    data: "Banner üzerinde verdiğiniz kabul/ret tercihleri ve zaman damgası",
    basis: "KVKK ispat yükümlülüğü",
    period: "1 yıl",
  },
];

/** Bireysel (C2C) ve kurumsal kullanıcılar için yasal kapsam farkları. */
const USER_SCOPE = [
  {
    criterion: "KVKK / kişisel veri",
    individual:
      "Tam kapsam. KVKK koruması altındadır; açık rıza ve aydınlatma zorunludur.",
    corporate:
      "Kısmi kapsam. Tüzel kişiler muaftır; şahıs şirketlerinde yetkili kişi KVKK'ya tabidir.",
  },
  {
    criterion: "Çerez ve rıza yönetimi",
    individual:
      "Kesin opt-in. Zorunlu olmayan tüm çerez ve pikseller için açık rıza şarttır.",
    corporate:
      "Standart banner kuralları geçerlidir. Kurumsal oturum çerezleri zorunlu sayılır.",
  },
  {
    criterion: "Ticari iletişim (ETK)",
    individual:
      "Önceden onay. Pazarlama iletileri için İYS onaylı açık rıza zorunludur.",
    corporate:
      "B2B istisna. Tacir ve esnafa yönelik iletilerde ETK istisnaları uygulanabilir (opt-out hakkı saklıdır).",
  },
  {
    criterion: "Sözleşme ve faturalandırma",
    individual:
      "Mesafeli satış. TKHK ve cayma hakları geçerlidir; e-arşiv fatura kesilir.",
    corporate:
      "TTK hükümleri geçerlidir; e-fatura ve kurumsal üyelik sözleşmesi bağlayıcıdır.",
  },
];

const THIRD_PARTIES = [
  {
    name: "Google (Analytics, Tag Manager, Ads, YouTube)",
    purpose: "Trafik analizi, gömülü video ve yeniden hedefleme",
    href: "https://policies.google.com/privacy",
  },
  {
    name: "Yandex (Metrica, Direct)",
    purpose: "Site içi tıklama/ısı haritası analizi ve reklam gösterimi",
    href: "https://yandex.com/legal/confidential/",
  },
  {
    name: "Meta (Facebook / Instagram)",
    purpose: "Yeniden pazarlama ve dönüşüm ölçümü",
    href: "https://www.facebook.com/privacy/policy",
  },
  {
    name: "TikTok",
    purpose: "Reklam dönüşüm ölçümü",
    href: "https://www.tiktok.com/legal/privacy-policy",
  },
  {
    name: "PayTR",
    purpose: "Ödeme işlemleri ve dolandırıcılık önleme",
    href: "https://www.paytr.com/kvkk",
  },
];

export default async function CookiesClient() {
  const t = await getTranslations();

  return (
    <DocPage
      title={t("legal.cookiesTitle")}
      description={`${t("legal.lastUpdated")}: 2 Ağustos 2026`}
    >
      <SectionCard title="1. Çerez Nedir?">
        <div className="prose prose-gray max-w-none">
          <p>
            Çerezler, web siteleri tarafından cihazınıza yerleştirilen küçük
            metin dosyalarıdır. Bu politika, çerezlerin yanı sıra tarayıcınızın
            yerel depolama (localStorage) alanında sakladığımız verileri de
            kapsar — mevzuat açısından ikisi de terminal ekipmanınıza erişim
            sayılır.
          </p>
          <p>
            Süreye göre <strong>oturum çerezleri</strong> (tarayıcıyı
            kapattığınızda silinir) ve <strong>kalıcı çerezler</strong>{" "}
            (belirlenen süre boyunca kalır); kaynağa göre{" "}
            <strong>birinci taraf</strong> (TARODAN) ve{" "}
            <strong>üçüncü taraf</strong> (hizmet sağlayıcılarımız) çerezleri
            olarak ayrılır.
          </p>
          <p>
            Zorunlu çerezler dışındaki hiçbir çerez, siz açık rıza vermeden
            çalıştırılmaz. Tercihinizi aşağıdaki panelden istediğiniz zaman
            değiştirebilirsiniz; rızanızı geri çekmeniz, geri çekme anına kadar
            gerçekleşen işlemleri etkilemez.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="2. Çerez Kategorileri ve Tercihleriniz">
        <CookiePreferencesPanel
          saveLabel={t("legal.savePreferences")}
          acceptAllLabel={t("legal.acceptAll")}
        />
      </SectionCard>

      <SectionCard title="3. Üçüncü Taraf Hizmet Sağlayıcılar">
        <p className="mb-4 text-sm text-muted">
          Aşağıdaki sağlayıcıların çerezleri yalnızca ilgili kategoriye rıza
          verdiğinizde yüklenir. Her biri kendi gizlilik politikasına tabidir.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="pb-2 font-medium">Sağlayıcı</th>
                <th className="pb-2 font-medium">Kullanım Amacı</th>
                <th className="pb-2 font-medium">Politika</th>
              </tr>
            </thead>
            <tbody className="text-body">
              {THIRD_PARTIES.map((party) => (
                <tr key={party.name} className="border-t border-border-subtle">
                  <td className="py-2 pr-4 font-medium">{party.name}</td>
                  <td className="py-2 pr-4">{party.purpose}</td>
                  <td className="py-2">
                    <a
                      href={party.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-600 hover:underline"
                    >
                      Görüntüle
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="4. Bireysel ve Kurumsal Kullanıcı Farkları">
        <p className="mb-4 text-sm text-muted">
          Koleksiyoner (C2C) alıcılar ile mağaza sahibi ticari satıcılar farklı
          yasal rejimlere tabidir.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="pb-2 font-medium">Kriter</th>
                <th className="pb-2 font-medium">Bireysel Kullanıcı</th>
                <th className="pb-2 font-medium">Kurumsal Kullanıcı</th>
              </tr>
            </thead>
            <tbody className="text-body">
              {USER_SCOPE.map((row) => (
                <tr
                  key={row.criterion}
                  className="border-t border-border-subtle"
                >
                  <td className="py-2 pr-4 align-top font-medium">
                    {row.criterion}
                  </td>
                  <td className="py-2 pr-4 align-top">{row.individual}</td>
                  <td className="py-2 align-top">{row.corporate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="5. Loglama ve Yasal Saklama Süreleri">
        <p className="mb-4 text-sm text-muted">
          Çerezlerin ötesinde, platform üzerindeki hareketleriniz aşağıdaki
          yasal dayanaklarla loglanır ve belirtilen süreler boyunca saklanır.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="pb-2 font-medium">Log Türü</th>
                <th className="pb-2 font-medium">Saklanan Veriler</th>
                <th className="pb-2 font-medium">Yasal Dayanak</th>
                <th className="pb-2 font-medium">Saklama Süresi</th>
              </tr>
            </thead>
            <tbody className="text-body">
              {RETENTION.map((row) => (
                <tr key={row.type} className="border-t border-border-subtle">
                  <td className="py-2 pr-4 align-top font-medium">
                    {row.type}
                  </td>
                  <td className="py-2 pr-4 align-top">{row.data}</td>
                  <td className="py-2 pr-4 align-top">{row.basis}</td>
                  <td className="whitespace-nowrap py-2 align-top">
                    {row.period}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 rounded-lg border border-border bg-surface p-4 text-sm text-muted">
          5651 kapsamındaki loglar, adli soruşturmalar açısından zaman damgası
          (timestamp) ve bütünlük hash&apos;i ile birlikte üretilip saklanır.
          KVKK kapsamındaki veriler ise işleme amacı sona erdiğinde periyodik
          imha takvimine göre silinir veya anonimleştirilir.
        </p>
      </SectionCard>

      <SectionCard title="6. Çerezleri Tarayıcıdan Kontrol Etme">
        <div className="prose prose-gray max-w-none">
          <p>
            Yukarıdaki panele ek olarak, tarayıcı ayarlarınızdan tüm çerezleri
            engelleyebilir, yalnızca üçüncü taraf çerezleri engelleyebilir,
            mevcut çerezleri silebilir veya her çerez yerleştirildiğinde uyarı
            alabilirsiniz. Mobil cihazlarda bu ayarlar tarayıcı veya cihaz
            ayarlarından yönetilir.
          </p>
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
        </div>
        <p className="mt-4 rounded-lg border border-warning-200 bg-warning-50 p-4 text-sm text-warning-800">
          <strong>Önemli:</strong> Zorunlu çerezleri tarayıcınızdan
          engellerseniz oturum açma, sepet ve ödeme gibi temel özellikler
          çalışmayabilir.
        </p>
      </SectionCard>

      <SectionCard title="7. Haklarınız, Güncellemeler ve İletişim">
        <div className="prose prose-gray max-w-none">
          <p>
            KVKK madde 11 uyarınca kişisel verilerinize erişme, düzeltilmesini
            veya silinmesini isteme, işlemeye itiraz etme ve rızanızı geri çekme
            haklarına sahipsiniz. Bu politikayı gerektiğinde güncelleriz; önemli
            değişiklikler platformda duyurulur ve bu sayfada yayınlanır.
          </p>
          <ul>
            <li>
              <strong>E-posta:</strong> destek@tarodan.com.tr
            </li>
            <li>
              <strong>Telefon:</strong> 0850 XXX XX XX
            </li>
          </ul>
        </div>
      </SectionCard>
    </DocPage>
  );
}

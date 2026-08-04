/** @format */

import type { LegalPart } from "@/components/legal/LegalDocument";
import { PLATFORM_ENTITY_FIELDS } from "@/lib/legal/platform-entity";

/**
 * Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi — metnin tek kaynağı.
 *
 * Belge PAZAR YERİ (aracı hizmet sağlayıcı) modeline göre yazılmıştır: satış
 * sözleşmesi kural olarak Satıcı ile Alıcı arasında kurulur, Platform aracılık
 * eder. Platform'un kendi ürününü sattığı işlemler ürün sayfasında ayrıca
 * belirtilir.
 *
 * Siparişe özel alanlar (ürün, tutar, taraf bilgileri) burada boş bırakılır ve
 * `fields` bloğuyla "siparişinizde belirtilir" olarak gösterilir: bu sayfa genel
 * sözleşme metnidir, sipariş bağlamı yoktur. Somut değerler sipariş özeti
 * ekranında ve sipariş onay e-postasında yer alır.
 */

const BUYER_FIELDS = [
  { label: "Ad Soyad / Unvan" },
  { label: "Teslimat Adresi" },
  { label: "Telefon" },
  { label: "E-posta" },
];

const SELLER_FIELDS = [
  { label: "Unvan / Ad Soyad" },
  { label: "MERSİS / Vergi No" },
  { label: "Adres" },
  { label: "Telefon / E-posta / KEP" },
];

/** A) ÖN BİLGİLENDİRME FORMU */
const PRE_INFORMATION: LegalPart = {
  title: "A) Ön Bilgilendirme Formu (Mesafeli Sözleşme Öncesi)",
  intro:
    "İşbu Ön Bilgilendirme Formu, https://tarodan.com.tr üzerinde verilen siparişe konu mesafeli sözleşme kurulmadan önce, tüketicinin bilgilendirilmesi amacıyla sunulmaktadır.",
  sections: [
    {
      number: "1",
      heading: "Taraf Bilgileri (Satıcı – Alıcı – Platform'un Aracılık Rolü)",
      blocks: [
        {
          type: "fields",
          intro: "Alıcı (Tüketici):",
          items: BUYER_FIELDS,
        },
        {
          type: "fields",
          intro: "Satıcı (Sözleşmenin Satıcı Tarafı):",
          items: SELLER_FIELDS,
        },
        {
          type: "fields",
          intro: "Platform (Aracı Hizmet Sağlayıcı):",
          items: PLATFORM_ENTITY_FIELDS,
        },
        {
          type: "note",
          text: "Bu sipariş kapsamındaki Mesafeli Satış Sözleşmesi kural olarak Satıcı ile Alıcı arasında kurulmaktadır. Platform, aracı hizmet sağlayıcı sıfatıyla siparişin alınması, ödeme altyapısının sağlanması, talep/şikâyetlerin iletilmesi, kayıtların tutulması ve mevzuattan doğan diğer yükümlülükler kapsamında sürece aracılık eder. Platform'un “satıcı” sıfatıyla satış yaptığı işlemler, ürün sayfasında ayrıca belirtilir.",
        },
        {
          type: "p",
          text: "Bu formun amacı; siparişi onaylamadan önce Alıcı'nın, siparişin onaylanması halinde ödeme yükümlülüğü altına gireceği hususu dahil olmak üzere tüm esaslı konularda açık ve anlaşılır şekilde bilgilendirilmesidir.",
        },
      ],
    },
    {
      number: "2",
      heading: "Sözleşme Konusu Mal/Hizmetin Temel Nitelikleri",
      blocks: [
        {
          type: "fields",
          intro:
            "Aşağıdaki bilgiler siparişinize özeldir; sipariş özeti ekranında ve sipariş onay e-postanızda yer alır.",
          items: [
            { label: "Ürün / Hizmet Adı" },
            { label: "Marka / Model" },
            { label: "Kullanım Durumu (sıfır / ikinci el / outlet)" },
            { label: "Renk, Beden, Ölçü vb. Özellikler" },
            { label: "Adet" },
            { label: "Temel özellikler ve ambalaj/içerik bilgisi" },
          ],
        },
        {
          type: "p",
          text: "Alıcı, ürünün temel niteliklerini ve görsellerini sipariş öncesinde incelediğini; ürünün elektronik ortamda sunulan açıklamalarının satın alma kararında esas olduğunu kabul eder. Satıcı, ilan/açıklamanın gerçeğe uygun olmasından sorumludur.",
        },
      ],
    },
    {
      number: "3",
      heading: "Toplam Fiyat, Vergiler ve Ek Masraflar",
      blocks: [
        {
          type: "fields",
          intro:
            "Ödenecek toplam tutarın kalemleri sipariş özeti ekranında ayrı ayrı gösterilir:",
          items: [
            { label: "Ürün Bedeli (KDV dahil)" },
            { label: "Teslimat / Kargo Ücreti (ödeyecek taraf belirtilir)" },
            { label: "Varsa Kapıda Ödeme / İşlem Ücreti" },
            {
              label:
                "Varsa Platform Koruma Hizmet Bedeli / Aracı Hizmet Bedeli",
            },
            { label: "Varsa İndirim / Kupon / Kampanya" },
            { label: "Ödenecek Toplam Tutar" },
          ],
        },
        {
          type: "note",
          text: "Alıcı, “Siparişi Onayla / Ödemeyi Tamamla” butonuna basması halinde ödemekle yükümlü olacağı toplam tutarı gördüğünü ve bu tutarın ödeme yükümlülüğü doğuracağını kabul eder.",
        },
      ],
    },
    {
      number: "4",
      heading: "Ödeme, Teslimat ve İfa Koşulları",
      blocks: [
        {
          type: "fields",
          items: [
            { label: "Ödeme Yöntemi (kredi kartı, banka kartı, havale vb.)" },
            { label: "Teslimat Adresi" },
            { label: "Tahmini Teslim Süresi" },
            {
              label:
                "Teslimat organizasyonu (satıcı gönderir / entegrasyonlu kargo)",
            },
          ],
        },
        {
          type: "p",
          text: "Satıcı, mevzuatta öngörülen azami süreler saklı kalmak üzere, siparişin alınmasını takiben taahhüt ettiği süre içerisinde edimini ifa etmekle yükümlüdür. Teslimat gecikmeleri, stok/tedarik, kargo operasyonu gibi hallerde Alıcı'ya bilgilendirme yapılır.",
        },
        {
          type: "p",
          text: "Siparişin kesinleşmesi, ödemenin tam ve eksiksiz yapılmasına bağlıdır. Ürünün Alıcı'ya veya Alıcı'nın gösterdiği üçüncü kişiye teslimi anında hasar ve ziya sorumluluğu Alıcı'ya geçer. Satıcı'nın, Alıcı'nın açık talimatı veya Platform'un operasyonel süreçleri dışında gerçekleştirdiği erken sevkiyat veya hatalı lojistik organizasyonundan doğan ek masraflardan bizzat Satıcı sorumludur.",
        },
      ],
    },
    {
      number: "5",
      heading: "Cayma Hakkı (14 Gün) – Kapsam, Süre ve Usul",
      blocks: [
        {
          type: "p",
          text: "Alıcı, teslimden itibaren 14 (on dört) gün içinde herhangi bir gerekçe göstermeksizin ve cezai şart ödemeksizin cayma hakkına sahiptir. Cayma bildiriminin bu süre içinde Satıcı'ya ve/veya Platform üzerinden sağlanan cayma kanallarına yöneltilmesi yeterlidir.",
        },
        {
          type: "list",
          items: [
            {
              text: "Alıcı, cayma bildirimini Hesabım → Siparişlerim → İade/Cayma menüsünden veya Satıcı'nın e-posta/KEP adresi üzerinden iletebilir.",
            },
            {
              text: "Alıcı'nın ürünü iade için göndermesi gereken usul ve iade adresi, iade talebi oluşturulduğunda Platform arayüzünde gösterilir.",
            },
            {
              text: "Cayma halinde iade kargo bedelinin kim tarafından karşılanacağı ve iade yöntemleri ürün sayfasında ve iade akışında ayrıca belirtilir.",
            },
          ],
        },
        {
          type: "p",
          text: "Cayma hakkı istisnaları: hijyen/sağlık nedeniyle iadesi uygun olmayan ürünler, hızlı bozulan gıdalar, tüketicinin istekleri doğrultusunda kişiselleştirilmiş ürünler vb. mevzuatta yer alan istisnalar saklıdır. Siparişe konu ürün cayma kapsamı dışındaysa, ürün sayfasında ve sipariş öncesi ekranda ayrıca belirtilir.",
        },
        {
          type: "note",
          text: "Ticari alıcıların (tacirlerin) ve Satıcı'nın bireysel kullanıcı (C2C) olduğu işlemlerin 6502 sayılı Kanun kapsamında olmaması sebebiyle, bu işlemlerde 14 günlük yasal cayma hakkı uygulanmaz.",
        },
      ],
    },
    {
      number: "6",
      heading: "İade / Değişim – Ayıplı Mal ve Satıcı Sorumluluğu",
      blocks: [
        {
          type: "p",
          text: "Cayma hakkından bağımsız olarak; ürünün ayıplı çıkması, eksik/yanlış gönderilmesi, hasarlı teslim edilmesi halinde Alıcı'nın tüketici mevzuatından doğan hakları saklıdır. Bu taleplerin muhatabı öncelikle Satıcı'dır. Platform, aracı hizmet sağlayıcı olarak talep iletim ve takip sistemini açık tutar; kayıtları muhafaza eder.",
        },
        {
          type: "p",
          text: "Alıcı'nın ayıp iddiasına ilişkin fotoğraf/video gibi delilleri Platform'a yüklemesi, inceleme ve uyuşmazlık yönetimi süreçlerinin sağlıklı yürütülmesine yardımcı olur.",
        },
      ],
    },
    {
      number: "7",
      heading: "Şikâyet, Talep ve Uyuşmazlık Çözümü",
      blocks: [
        {
          type: "list",
          items: [
            {
              label: "Platform",
              text: "Destek Merkezi üzerinden talep açarak, support@tarodan.com.tr adresinden veya 0 232 433 41 42 numarasından.",
            },
            {
              label: "Satıcı",
              text: "Ürün ve sipariş sayfasında yer alan satıcı e-posta/telefon/KEP bilgileri üzerinden.",
            },
          ],
        },
        {
          type: "p",
          text: "Uyuşmazlıklarda tüketici; parasal sınırlar dahilinde Tüketici Hakem Heyeti'ne, diğer hallerde dava şartı arabuluculuk sonrası Tüketici Mahkemesi'ne başvurabilir.",
        },
      ],
    },
    {
      number: "8",
      heading: "Ön Bilgilendirme Onayı ve Kalıcı Veri Saklayıcısı",
      blocks: [
        {
          type: "p",
          text: "Alıcı, siparişi onaylamadan önce bu Ön Bilgilendirme'yi okuduğunu ve anladığını, sipariş onayının ödeme yükümlülüğü doğurduğunu kabul eder.",
        },
        {
          type: "p",
          text: "Ön Bilgilendirme ve Mesafeli Satış Sözleşmesi'ne Hesabım → Siparişlerim alanından erişilebilir; ayrıca kayıtlı e-posta adresinize bağlantı olarak gönderilebilir.",
        },
        {
          type: "note",
          text: "Onay kutucuğu metni: “Ön Bilgilendirme Formu'nu okudum, siparişi onayladığım takdirde ödeme yükümlülüğü altına gireceğimi anladım.”",
        },
      ],
    },
  ],
};

/** B) MESAFELİ SATIŞ SÖZLEŞMESİ */
const SALES_CONTRACT: LegalPart = {
  title: "B) Mesafeli Satış Sözleşmesi",
  sections: [
    {
      number: "1",
      heading: "Taraflar, Tanımlar ve Sözleşmenin Kurulması",
      blocks: [
        {
          type: "p",
          text: "İşbu Mesafeli Satış Sözleşmesi; TARODAN üzerinden siparişin Alıcı tarafından onaylanması ile elektronik ortamda kurulmuştur.",
        },
        { type: "fields", intro: "Alıcı (Tüketici):", items: BUYER_FIELDS },
        { type: "fields", intro: "Satıcı:", items: SELLER_FIELDS },
        {
          type: "fields",
          intro: "Platform (Aracı Hizmet Sağlayıcı):",
          items: PLATFORM_ENTITY_FIELDS,
        },
        {
          type: "p",
          text: "Sözleşme'nin konusu; nitelikleri ve satış bedeli belirtilen ürün/hizmetin satışı ve teslimi/ifası ile Tarafların hak ve yükümlülüklerinin belirlenmesidir.",
        },
        {
          type: "note",
          text: "Platform, kural olarak bu Sözleşme'nin satıcı tarafı değildir; ancak TKHK ve ilgili mevzuat uyarınca, aracı hizmet sağlayıcı sıfatıyla belirli yükümlülüklere tabi olabilir ve tüketici taleplerinin iletilmesi/takibi için sistem sağlar. Ticari (B2B) işlemlerde Platform yalnızca aracı hizmet sağlayıcıdır.",
        },
      ],
    },
    {
      number: "2",
      heading: "Sözleşme Konusu Ürün/Hizmet Bilgileri",
      blocks: [
        {
          type: "fields",
          intro:
            "Aşağıdaki bilgiler siparişinize özeldir ve sipariş özetinde gösterilir:",
          items: [
            { label: "Ürün / Hizmet" },
            { label: "Adet" },
            { label: "Birim Fiyat (KDV dahil)" },
            { label: "Ara Toplam" },
            { label: "Teslimat / Kargo (ödeyecek taraf belirtilir)" },
            { label: "Varsa Hizmet Bedeli / Komisyon" },
            { label: "İndirim / Kupon" },
            { label: "Toplam" },
            { label: "Teslimat Adresi" },
            { label: "Fatura Bilgisi (ad/unvan, vergi bilgisi, adres)" },
          ],
        },
      ],
    },
    {
      number: "3",
      heading: "Ödeme, Teslimat ve İfa",
      blocks: [
        {
          type: "p",
          text: "Ödeme yöntemi ve ödemenin ne zaman tahsil edileceği sipariş akışında gösterilir; kural olarak sipariş onayında tahsil edilir.",
        },
        {
          type: "p",
          text: "Satıcı, siparişin kendisine ulaştığı andan itibaren taahhüt ettiği süre içinde teslim/ifa yükümlülüğünü yerine getirecektir. Teslimatın imkânsızlaşması veya stok/tedarik sorunları halinde, Alıcı'ya gecikmeksizin bilgi verilir ve mevzuattan doğan haklar saklıdır.",
        },
        {
          type: "p",
          text: "Teslim anında kargo paketi hasarlıysa Alıcı'nın tutanak düzenletmesi; ayıp/hasar iddialarının ispatında önemlidir. Bu, Alıcı'nın yasal haklarını ortadan kaldırmaz; yalnızca süreç yönetimini kolaylaştırır.",
        },
      ],
    },
    {
      number: "4",
      heading: "Cayma Hakkı ve Kullanımı (14 Gün)",
      blocks: [
        {
          type: "p",
          text: "Alıcı, ürünü teslim aldığı tarihten itibaren 14 gün içinde cayma hakkını kullanabilir. Cayma hakkının kullanılması için Platform'daki iade/cayma modülü üzerinden talep oluşturulması veya Satıcı'ya yazılı bildirim (e-posta/KEP) yapılması yeterlidir.",
        },
        {
          type: "list",
          items: [
            {
              text: "İade edilecek ürün; kullanılmamış, tekrar satılabilirliğini yitirmemiş şekilde (ürünün niteliğine göre) iade edilmelidir.",
            },
            {
              text: "İade sürecinde ürünün hangi kargo firmasıyla ve hangi kodla gönderileceği Platform arayüzünde gösterilir.",
            },
            {
              text: "İade masraflarının kim tarafından karşılanacağına ilişkin kural ve istisnalar ürün sayfasında belirtilir.",
            },
          ],
        },
        {
          type: "p",
          text: "Cayma hakkı kapsamı dışında kalan ürün/hizmetler (mevzuattaki istisnalar) sipariş öncesinde ayrıca bildirilmektedir. Cayma kapsam dışıysa Alıcı bunu onaylar.",
        },
      ],
    },
    {
      number: "5",
      heading: "Ayıplı Mal / Eksik – Yanlış Gönderim / Hasarlı Teslim",
      blocks: [
        {
          type: "p",
          text: "Ürünün ayıplı çıkması, eksik/yanlış gönderilmesi veya hasarlı teslim edilmesi halinde Alıcı'nın tüketici mevzuatından doğan seçimlik hakları saklıdır. Bu kapsamda Satıcı, ürünün ayıpsız ve sözleşmeye uygun tesliminden sorumludur.",
        },
        {
          type: "list",
          items: [
            {
              text: "Platform, Alıcı'nın talebini Satıcı'ya iletmekle yükümlüdür.",
            },
            { text: "Talep ve şikâyet kayıtlarını tutar." },
            {
              text: "Tüketiciye süreç takibi sağlayan sistemi açık tutar.",
            },
          ],
        },
        {
          type: "p",
          text: "Platform, tüketici mağduriyetini gidermek adına uyuşmazlık çözüm mekanizmasını işletir. Satıcı'nın iflası, konkordato ilan etmesi veya edimini ifa edememesi (mali acziyet) durumunda Platform, Satıcı'nın içerideki hakedişlerine (emanet havuzuna) bloke koyma ve bu tutarları doğrudan tüketiciye iade etme yetkisine sahiptir.",
        },
        {
          type: "p",
          text: "Alıcı'nın ayıp iddiasına ilişkin delilleri (fotoğraf/video) sisteme yüklemesi istenir.",
        },
      ],
    },
    {
      number: "6",
      heading: "İletişim, Şikâyet ve Uyuşmazlıklar",
      blocks: [
        {
          type: "p",
          text: "Alıcı, Platform'un Destek Merkezi üzerinden veya ürün/sipariş sayfasında yer alan satıcı iletişim bilgileri üzerinden talebini iletebilir. Uyuşmazlık halinde Alıcı; Tüketici Hakem Heyeti'ne veya dava şartı arabuluculuk sonrası Tüketici Mahkemesi'ne başvurabilir. Yetki ve görev kuralları emredici hükümler gereği uygulanır.",
        },
        {
          type: "note",
          text: "Aşağıdaki 6.1–6.7 maddeleri, Platform ile Satıcı arasındaki TİCARİ ilişkiyi düzenler. Tüketicilere cezai şart uygulanamaz.",
        },
      ],
    },
    {
      number: "6.1",
      heading: "Rücu, Mahsup ve Emanet Ödeme (Escrow)",
      blocks: [
        {
          type: "p",
          text: "Platform, tüketicinin cayma hakkını kullanması, ayıplı mal iadesi veya bankalar nezdinde gerçekleşen ters ibraz (chargeback) işlemleri sonucunda ödemek zorunda kaldığı tüm tutarlar ile idari para cezalarını, Satıcı'nın onayını aramaksızın Satıcı'nın cari hesabına borç kaydetmeye ve hakedişlerinden tek taraflı mahsup etmeye tam yetkilidir.",
        },
      ],
    },
    {
      number: "6.2",
      heading: "Delil Sözleşmesi",
      blocks: [
        {
          type: "p",
          text: "Taraflar, aralarındaki uyuşmazlıklarda Platform'un veri tabanında tuttuğu elektronik kayıtların, logların, iade takip modülü verilerinin ve ticari defterlerinin HMK m.193 ve m.222 uyarınca münhasır ve kesin delil teşkil edeceğini kabul eder.",
        },
      ],
    },
    {
      number: "6.3",
      heading: "Cezai Şart (Ticari Satıcılar İçin)",
      blocks: [
        {
          type: "p",
          text: "Satıcı'nın sahte/yanıltıcı ürün göndermesi, platform dışına işlem yönlendirmesi, ispat yükünü yerine getirmemesi veya haksız iade reddi durumlarında, ilgili ürün bedelinin %20'si oranında cezai şartı Platform'a ödemeyi kabul eder. Tüketicilere cezai şart uygulanamaz.",
        },
      ],
    },
    {
      number: "6.4",
      heading: "Komisyon ve Hizmet Bedelleri",
      blocks: [
        {
          type: "p",
          text: "Platform, piyasa koşullarını gözeterek komisyon oranlarında ve kargo/hizmet bedellerinde değişiklik yapma hakkını saklı tutar (7 gün önceden bildirim şartıyla). Bu bedeller Satıcı'ya fatura edilir ve cari hesaptan düşülür.",
        },
      ],
    },
    {
      number: "6.5",
      heading: "Rekabet ve Fiyatlandırma",
      blocks: [
        {
          type: "p",
          text: "Platformun sunduğu otomatik fiyatlandırma araçları, satıcılar arası fiyat sabitleme (kartel) amacıyla kullanılamaz. Platform, kargo algoritmalarında tarafsızlık ilkesine uyar. Satıcılar, Platform'da satış yaparken objektif kalite standartlarına uymak zorundadır.",
        },
      ],
    },
    {
      number: "6.6",
      heading: "İYS ve Veri Uyumu",
      blocks: [
        {
          type: "p",
          text: "Satıcı, İleti Yönetim Sistemi (İYS) mevzuatına tam uyum sağlamakla yükümlüdür. Aksi halde Platform, Satıcı'nın faaliyetlerini askıya alabilir.",
        },
      ],
    },
    {
      number: "6.7",
      heading: "Manevi Tazminat Sınırı",
      blocks: [
        {
          type: "p",
          text: "Sözleşmenin ifa edilmemesi veya gecikmesi hallerinde, tüzel kişi/ticari taraflar birbirlerinden manevi tazminat talep edemez.",
        },
      ],
    },
    {
      number: "7",
      heading: "Kişisel Veriler",
      blocks: [
        {
          type: "p",
          text: "Alıcı'nın kişisel verileri; üyelik/sipariş/teslimat/ödeme/iade süreçlerinin yürütülmesi ve mevzuattan doğan yükümlülüklerin yerine getirilmesi amacıyla işlenir. Detaylar Platform'daki KVKK Aydınlatma Metni'nde açıklanmıştır.",
        },
        {
          type: "p",
          text: "Satıcı; Alıcı verilerini yalnızca siparişin ifası/teslimat ve yasal yükümlülükler kapsamında kullanabilir; reklam/pazarlama gibi amaçlarla ayrıca kullanamaz.",
        },
      ],
    },
    {
      number: "8",
      heading: "Yürürlük ve Erişim",
      blocks: [
        {
          type: "p",
          text: "Bu Sözleşme, siparişin Alıcı tarafından elektronik ortamda onaylanması ile yürürlüğe girer. Sözleşme metnine Alıcı, Hesabım → Siparişlerim alanından erişebilir; ayrıca e-posta ile kendisine gönderilebilir.",
        },
        {
          type: "note",
          text: "Onay kutucuğu metni: “Mesafeli Satış Sözleşmesi'ni okudum ve kabul ediyorum.”",
        },
      ],
    },
  ],
};

export const DISTANCE_SALES_PARTS: LegalPart[] = [
  PRE_INFORMATION,
  SALES_CONTRACT,
];

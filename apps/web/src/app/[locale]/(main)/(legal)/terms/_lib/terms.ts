/** @format */

import type { LegalPart } from "@/components/legal/LegalDocument";
import {
  PLATFORM_ENTITY,
  PLATFORM_ENTITY_FIELDS,
} from "@/lib/legal/platform-entity";

/**
 * Platform Kullanım Koşulları — kayıt, listeleme, satış, satın alma, teklif ve
 * takas işlevlerinin mevcut çalışma biçimine göre hazırlanmıştır.
 *
 * Ödeme öncesinde sunulan işleme özel sözleşme ve bilgiler bu genel metni
 * tamamlar; tüketicinin emredici haklarını daraltan bir yorum yapılamaz.
 */
export const TERMS_PARTS: LegalPart[] = [
  {
    title: "Tarodan Platform Kullanım Koşulları",
    intro:
      "Bu Kullanım Koşulları, Tarodan internet sitesi ve uygulamalarını ziyaret eden veya üye olarak kullanan kişiler ile Platform işletmecisi arasındaki Platform kullanım ilişkisini düzenler. Bir satışın, üyeliğin, öne çıkarma hizmetinin veya takasın kendine özgü şartları ödeme ya da onay öncesinde ayrıca gösterilir.",
    sections: [
      {
        number: "1",
        heading: "Platform İşletmecisi",
        blocks: [
          {
            type: "p",
            text: `${PLATFORM_ENTITY.brand} markalı elektronik ticaret pazar yeri ${PLATFORM_ENTITY.legalName} (“Tarodan” veya “Şirket”) tarafından işletilir.`,
          },
          { type: "fields", items: PLATFORM_ENTITY_FIELDS },
        ],
      },
      {
        number: "2",
        heading: "Koşulların Kabulü ve Uygulanması",
        blocks: [
          {
            type: "p",
            text: "Ziyaretçi Platform'u kullandığında; üye ise kayıt sırasında veya ilgili işlemi onaylarken bu koşulları okuduğunu ve kendisine uygulanabildiği ölçüde kabul ettiğini beyan eder. Üyelik, satış, satın alma, takas, kampanya veya ücretli hizmet için ayrıca sunulan özel koşullar bu metni tamamlar. Özel koşullarla bu metin arasında çelişki bulunursa ilgili işleme daha özgü olan hüküm, emredici mevzuata aykırı olmamak kaydıyla uygulanır.",
          },
          {
            type: "note",
            text: "Bu koşullar tüketicinin kanundan doğan cayma, ayıplı mal, tazminat, başvuru ve diğer emredici haklarını ortadan kaldırmaz veya sınırlandırmaz.",
          },
        ],
      },
      {
        number: "3",
        heading: "Üyelik ve Hesap Güvenliği",
        blocks: [
          {
            type: "list",
            items: [
              {
                text: "Üye, hukuken bağlayıcı işlem yapma ehliyetine sahip olmalı; bu ehliyete sahip değilse yasal temsilcisi aracılığıyla hareket etmelidir.",
              },
              {
                text: "Kayıt ve doğrulama sırasında doğru, güncel ve kendisine ait bilgiler vermek; değişiklikleri gecikmeden güncellemek üyenin sorumluluğundadır.",
              },
              {
                text: "Şifre, doğrulama kodu ve oturum bilgileri üçüncü kişilerle paylaşılmamalıdır. Yetkisiz kullanım şüphesi derhâl Tarodan'a bildirilmelidir.",
              },
              {
                text: "Bir kişinin başkası adına hesap açması veya işlem yapması ancak geçerli temsil yetkisi varsa mümkündür. Kurumsal hesap kullanıcıları işletmeyi temsil etmeye yetkili olduklarını beyan eder.",
              },
            ],
          },
        ],
      },
      {
        number: "4",
        heading: "Pazar Yeri Modeli ve Sözleşmenin Tarafları",
        blocks: [
          {
            type: "p",
            text: "Tarodan, kural olarak alıcılar ile bağımsız satıcıları buluşturan aracı hizmet sağlayıcıdır. Ürün sayfasında satıcı olarak Şirket'in açıkça gösterildiği işlemler dışında satış sözleşmesi alıcı ile ilgili satıcı arasında kurulur. Tarodan; ilan, iletişim, teklif, ödeme, kargo, iade, uyuşmazlık ve hakediş süreçleri için teknik altyapı sağlar ve mevzuatın aracı hizmet sağlayıcıya yüklediği sorumlulukları yerine getirir.",
          },
          {
            type: "p",
            text: "Satıcı tarafından girilen ürünün özgünlüğü, mülkiyeti, açıklaması, durumu, ayıpları ve stok bilgileri satıcının beyanıdır. Tarodan'ın içerik kontrolü yapması, öne çıkarması veya işlem desteği vermesi satıcının hukuki sorumluluğunu devraldığı anlamına gelmez; Tarodan'ın kanundan doğan kendi sorumlulukları saklıdır.",
          },
        ],
      },
      {
        number: "5",
        heading: "İlan Verme ve Satıcının Yükümlülükleri",
        blocks: [
          {
            type: "list",
            items: [
              {
                text: "Satıcı yalnızca mülkiyetinde bulunan veya satış/takas yetkisine sahip olduğu, hukuka uygun ürünleri listeleyebilir.",
              },
              {
                text: "Başlık, fotoğraf, marka, ölçek, kondisyon, eksik parça, onarım, hasar, fiyat, stok, kargo paketi ve diğer nitelikler doğru ve güncel olmalıdır.",
              },
              {
                text: "Sahte, taklit, çalıntı, mevzuata aykırı, üçüncü kişi hakkını ihlal eden veya güvenli olmayan ürünler listelenemez.",
              },
              {
                text: "Satıcı, tamamlanan siparişi belirtilen sürede güvenli biçimde paketleyip kendisine verilen kargo koduyla teslim etmek ve satış sonrası yasal yükümlülüklerini yerine getirmek zorundadır.",
              },
              {
                text: "Ticari veya mesleki amaçla satış yapan satıcı; vergi, fatura, garanti, mesafeli sözleşme ve tüketici mevzuatından doğan yükümlülüklerinden kendisi sorumludur.",
              },
            ],
          },
        ],
      },
      {
        number: "6",
        heading: "Satın Alma, Teklif ve Takas",
        blocks: [
          {
            type: "p",
            text: "Alıcı, işlemi onaylamadan önce ürün açıklamasını, satıcı bilgisini, toplam bedeli, komisyon/hizmet bedelini, kargoyu, teslimat adresini ve uygulanabilir sözleşmeleri kontrol etmelidir. Sipariş, ödeme kuruluşunun işlemi onaylaması ve Platform'un sipariş kaydını oluşturmasıyla kesinleşir. Teklifin gönderilmesi tek başına satış doğurmaz; satıcının kabulü ve gerekli ödeme/onay adımları tamamlanmalıdır.",
          },
          {
            type: "p",
            text: "Takasta her taraf sunduğu ürünler bakımından satıcı, karşılığında alacağı ürünler bakımından alıcı gibi hareket eder. Ürün değer farkı, taraflara uygulanan komisyon, kargo bedeli ve varsa nakit farkı onaydan önce gösterilir. Takasa gönderilen ürünler kontrol noktasına ulaşmadan karşı tarafa yönlendirilmez; işlem durumu takas detayından izlenir.",
          },
        ],
      },
      {
        number: "7",
        heading: "Fiyatlar, Komisyonlar ve Ücretli Hizmetler",
        blocks: [
          {
            type: "list",
            items: [
              {
                text: "Ürün fiyatı satıcı tarafından belirlenir. Geçerli indirim veya kupon varsa komisyon kuralı, işlem anındaki indirimli ürün tutarı ile ürün kategorisi ve satıcı tipi üzerinden belirlenir.",
              },
              {
                text: "Alıcı ve satıcı tarafındaki komisyon, hizmet, koruma ve takas ücretleri; ilgili işleme uygulanabilen kurala göre hesaplanır ve onaydan önce ayrı kalemler hâlinde gösterilir.",
              },
              {
                text: "Kargo ücreti, ilanda seçilen paket boyutu ve aktif kargo tarifesine göre komisyon kuralından bağımsız hesaplanır.",
              },
              {
                text: "Üyelik ve ilan öne çıkarma gibi sanal hizmetlerin kapsamı, süresi, fiyatı, yenilenme ve iptal koşulları satın alma ekranında gösterilir. Bu hizmetler katalog ürünü değildir ve genel ürün araması ile kullanıcının ilan listesinde gösterilmez.",
              },
              {
                text: "Onaylanmış bir işlemin kayıt altına alınan fiyatlama sürümü, sonradan yayımlanan yeni bir tarife veya komisyon kuralı nedeniyle sessizce değiştirilmez; fiyatlama geçersizleşmişse kullanıcıdan güncel özeti yeniden onaylaması istenir.",
              },
            ],
          },
        ],
      },
      {
        number: "8",
        heading: "Ödeme, Hakediş ve İadeler",
        blocks: [
          {
            type: "p",
            text: "Ödemeler Platform'un entegre ödeme kuruluşu aracılığıyla alınır. Tarodan kart numarasını doğrudan saklamaz; kullanıcı kart kaydetmeyi açıkça seçerse kart bilgileri ödeme kuruluşunun güvenli altyapısında, Tarodan hesabıyla ilişkilendirilmiş bir belirteç üzerinden kullanılabilir. Kayıtlı kartlar hesap alanından yönetilebilir.",
          },
          {
            type: "p",
            text: "Satıcı hakedişi; ürün bedeli, geçerli kesinti ve vergiler, kargo maliyeti, iade/uyuşmazlık durumu ve ödeme bekleme süresi dikkate alınarak işlem detayında gösterilir. İade, ters ibraz, sahtecilik incelemesi, yasal yükümlülük veya borç/mahsup bulunması hâlinde hakediş mevzuata ve işleme özel koşullara uygun olarak bekletilebilir veya mahsup edilebilir.",
          },
        ],
      },
      {
        number: "9",
        heading: "Kargo, Teslimat, İade ve Uyuşmazlıklar",
        blocks: [
          {
            type: "p",
            text: "Sipariş ve takas gönderileri Kargo ve Teslimat Politikası'na göre yürütülür. Cayma, ayıplı ürün, eksik veya yanlış ürün talepleri İade Politikası, Mesafeli Satış Sözleşmesi ve uygulanabilir mevzuata göre değerlendirilir. Kullanıcı, uyuşmazlıkta istenen fotoğraf, video, taşıyıcı kaydı ve açıklamaları doğru ve zamanında sunmalıdır; bu yükümlülük emredici ispat kurallarını veya tüketici haklarını ortadan kaldırmaz.",
          },
        ],
      },
      {
        number: "10",
        heading: "Kullanıcı İçerikleri ve Fikrî Haklar",
        blocks: [
          {
            type: "p",
            text: "Kullanıcı, Platform'a yüklediği fotoğraf, açıklama, yorum, mesaj ve diğer içerikler üzerinde gerekli haklara sahip olmalıdır. İçeriğin mülkiyeti kullanıcıda kalır. Kullanıcı, içeriğin Platform'da barındırılması, teknik olarak çoğaltılması, boyutlandırılması, ilan ve arama sonuçlarında gösterilmesi ve hizmetin tanıtımı için gerekli ölçüde Tarodan'a dünya çapında, bedelsiz, devredilebilir olmayan ve alt hizmet sağlayıcılara teknik amaçla kullandırılabilir bir kullanım izni verir. İzin, içeriğin Platform'da tutulmasını gerektiren hukuki saklama yükümlülükleri dışında içerik kaldırıldığında sona erer.",
          },
          {
            type: "p",
            text: "Tarodan markası, yazılımı, tasarımı, veri tabanı ve Platform tarafından üretilen içerikler üzerindeki haklar Şirket'e veya ilgili hak sahibine aittir. Bunlar yazılı izin olmadan kopyalanamaz, tersine mühendisliğe tabi tutulamaz veya ticari amaçla kullanılamaz.",
          },
        ],
      },
      {
        number: "11",
        heading: "Yasaklanan Davranışlar",
        blocks: [
          {
            type: "list",
            items: [
              {
                text: "Dolandırıcılık, yanıltıcı beyan, sahte işlem, fiyat veya değerlendirme manipülasyonu yapmak; başkasının hesabını ya da ödeme aracını izinsiz kullanmak.",
              },
              {
                text: "Tarafları Platform dışı ödeme veya teslimata yönlendirerek güvenlik ve ücret mekanizmalarını kasıtlı biçimde aşmak.",
              },
              {
                text: "Hakaret, tehdit, taciz, nefret söylemi, kişisel veri ifşası, istenmeyen ticari ileti veya hukuka aykırı içerik paylaşmak.",
              },
              {
                text: "Zararlı yazılım, otomatik saldırı, yetkisiz erişim, güvenlik testi, veri kazıma, aşırı trafik veya hizmetin işleyişini bozacak başka teknik faaliyette bulunmak.",
              },
              {
                text: "Fikrî mülkiyet, kişilik, gizlilik veya tüketici hakları dâhil üçüncü kişi haklarını ihlal etmek.",
              },
            ],
          },
        ],
      },
      {
        number: "12",
        heading: "İçerik Denetimi ve Hesap Tedbirleri",
        blocks: [
          {
            type: "p",
            text: "Tarodan; bu koşullara, işleme özel kurallara veya mevzuata aykırı içerikleri inceleyebilir, görünürlüğünü sınırlayabilir ya da kaldırabilir. Dolandırıcılık, ödeme riski, sahte ürün, güvenlik ihlali, tekrarlanan kötüye kullanım veya yasal yükümlülük hâlinde ilan verme, satış, satın alma, ödeme, mesajlaşma ya da hesap erişimi geçici veya kalıcı olarak sınırlandırılabilir.",
          },
          {
            type: "p",
            text: "Kanunen bildirim yapılmasının sakıncalı olduğu, acil güvenlik tedbiri gereken veya incelemenin etkilenebileceği durumlar dışında kullanıcıya tedbirin temel nedeni ve mevcut itiraz/destek yolu bildirilir. Tedbir, devam eden sipariş, iade, hakediş, borç, kayıt saklama veya yasal sorumlulukları ortadan kaldırmaz.",
          },
        ],
      },
      {
        number: "13",
        heading: "Hukuka Aykırı İçerik ve Hak İhlali Bildirimleri",
        blocks: [
          {
            type: "p",
            text: "Hukuka aykırı veya fikrî mülkiyet hakkını ihlal ettiği düşünülen ilan ve içerikler, ilgili içerik bağlantısı, hak sahipliğini ve ihlali açıklayan belgeler ile iletişim bilgileri eklenerek Tarodan'a bildirilebilir. Tarodan, başvuruyu yürürlükteki mevzuata göre değerlendirir; gerekli hâllerde içeriği erişimden kaldırır, ilgili kullanıcıdan açıklama ister ve yetkili mercilere bildirim yapar. Eksik veya kötü niyetli bildirimler işleme alınmayabilir; tarafların yetkili mercilere başvuru hakkı saklıdır.",
          },
        ],
      },
      {
        number: "14",
        heading: "Kişisel Veriler, Çerezler ve İletişim",
        blocks: [
          {
            type: "p",
            text: "Kişisel verilerin işlenmesi Gizlilik Politikası ve KVKK Aydınlatma Metni'ne; çerezler Çerez Politikası'na tabidir. Sipariş, hesap güvenliği, ödeme, kargo, iade ve sözleşmenin ifası için gerekli bildirimler hizmet iletişimidir. Kampanya ve pazarlama iletileri ise uygulanabilir onay ve ret kurallarına göre gönderilir.",
          },
        ],
      },
      {
        number: "15",
        heading: "Hizmetin İşleyişi ve Değişiklikler",
        blocks: [
          {
            type: "p",
            text: "Bakım, güvenlik, mücbir sebep, taşıyıcı veya ödeme kuruluşu kesintisi ve teknik arıza nedeniyle Platform'un bazı işlevleri geçici olarak kullanılamayabilir. Tarodan makul süre içinde hizmeti yeniden sağlamak ve etkilenmiş işlemleri korumak için gerekli önlemleri alır; mevzuattan doğan sorumluluklar saklıdır.",
          },
          {
            type: "p",
            text: "Koşullar mevzuat, iş modeli veya özellik değişiklikleri nedeniyle ileriye etkili olarak güncellenebilir. Kullanıcının hak veya yükümlülüklerini önemli ölçüde etkileyen değişiklikler yürürlüğe girmeden önce uygun bir kanaldan bildirilir. Değişiklikten önce kesinleşen işlemlere, aksi kullanıcı lehine veya kanunen zorunlu olmadıkça, işlem tarihinde kabul edilen koşullar uygulanır.",
          },
        ],
      },
      {
        number: "16",
        heading: "Sorumluluğun Sınırları",
        blocks: [
          {
            type: "p",
            text: "Tarodan, kendi kusuru veya kanundan doğan yükümlülüğü kapsamındaki zararlardan yürürlükteki mevzuata göre sorumludur. Şirket'in sorumluluğunu ağır kusur, kast, kişisel zarar, veri koruma, ödeme güvenliği veya tüketicinin emredici hakları bakımından kaldıran ya da mevzuata aykırı biçimde sınırlayan bir yorum yapılamaz.",
          },
          {
            type: "p",
            text: "Kullanıcının yanlış bilgi vermesi, hesabını güvensiz kullanması, Platform dışı işlem yapması veya üçüncü taraf hizmetlerinde Tarodan'a yüklenemeyen bir kesinti nedeniyle doğan sonuçlardan ilgili kullanıcı ya da hizmet sağlayıcı sorumlu olabilir. Bu durum Tarodan'ın olay bazında gerekli desteği ve kanuni yükümlülüklerini yerine getirmesine engel değildir.",
          },
        ],
      },
      {
        number: "17",
        heading: "Üyeliğin Sona Ermesi",
        blocks: [
          {
            type: "p",
            text: "Üye, hesap ayarları veya destek kanalı üzerinden üyeliğinin kapatılmasını isteyebilir. Devam eden sipariş, takas, iade, hakediş, borç, uyuşmazlık ya da mevzuattan doğan kayıt saklama yükümlülüğü varsa hesap verileri ilgili süreç tamamlanana veya yasal süre dolana kadar gerekli ölçüde tutulabilir. Hesabın kapanması önceden doğmuş ödeme ve sorumlulukları ortadan kaldırmaz.",
          },
        ],
      },
      {
        number: "18",
        heading: "Uygulanacak Hukuk ve Uyuşmazlık Çözümü",
        blocks: [
          {
            type: "p",
            text: "Bu koşullara Türk hukuku uygulanır. Tüketiciler, yürürlükteki parasal sınırlar ve yetki kuralları çerçevesinde yerleşim yerlerindeki veya işlemin yapıldığı yerdeki Tüketici Hakem Heyetine ya da Tüketici Mahkemesine başvurabilir. Tüketici sıfatı bulunmayan taraflar bakımından kanunen yetkili mahkeme ve icra daireleri yetkilidir. Tarafların arabuluculuk ve diğer kanuni başvuru yolları saklıdır.",
          },
        ],
      },
      {
        number: "19",
        heading: "İletişim ve Elektronik Kayıtlar",
        blocks: [
          {
            type: "p",
            text: `Koşullar veya bir işlem hakkındaki sorular ${PLATFORM_ENTITY.email} adresine, ${PLATFORM_ENTITY.kep} KEP adresine ya da Platform'daki destek kanalına iletilebilir. Sipariş, sözleşme, onay ve işlem kayıtları mevzuatta öngörülen süre boyunca erişilebilir ve güvenli biçimde saklanır. Platform kayıtları diğer hukuka uygun delillerle birlikte değerlendirilir; hiçbir hüküm kullanıcının kanuni delil ve ispat haklarını ortadan kaldırmaz.`,
          },
        ],
      },
    ],
  },
];

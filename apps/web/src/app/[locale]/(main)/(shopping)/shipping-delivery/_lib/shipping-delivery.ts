/** @format */

import type { LegalPart } from "@/components/legal/LegalDocument";
import { PLATFORM_ENTITY_FIELDS } from "@/lib/legal/platform-entity";

/**
 * Tarodan kargo ve teslimat politikasının tek içerik kaynağı.
 *
 * Operasyonel süre veya taşıyıcı değiştiğinde bu metin de güncellenmelidir.
 * Tutarlar özellikle sabit yazılmaz: kullanıcı için bağlayıcı olan tutar, aktif
 * kargo tarifesi ve ilanda seçilen paket boyutuyla ödeme adımında hesaplanır.
 */
export const SHIPPING_DELIVERY_PARTS: LegalPart[] = [
  {
    title: "Kargo ve Teslimat Politikası",
    intro:
      "Bu politika, Tarodan üzerinden verilen siparişlerde ve gerçekleştirilen takaslarda ürünlerin hazırlanması, taşınması, teslimi ve takibi hakkında bilgi verir. Ödeme veya takas onayı öncesinde gösterilen işleme özel tutar, adres, paket ve teslimat bilgileri bu politikanın ayrılmaz parçasıdır.",
    sections: [
      {
        number: "1",
        heading: "Kapsam ve Tarafların Rolü",
        blocks: [
          {
            type: "p",
            text: "Tarodan, üçüncü taraf alıcı ve satıcıları buluşturan bir elektronik ticaret pazar yeridir. Ürün sayfasında satıcı olarak Tarodan'ı işleten şirketin açıkça gösterildiği işlemler dışında ürünün hazırlanması, uygun biçimde paketlenmesi ve taşıyıcıya teslim edilmesi ilgili satıcının sorumluluğundadır. Tarodan; kargo kaydının oluşturulması, ücretin hesaplanması, durumların gösterilmesi ve destek süreçlerinin yürütülmesi için teknik aracılık sağlar.",
          },
          {
            type: "fields",
            intro: "Platform işletmecisi ve destek kanalları:",
            items: PLATFORM_ENTITY_FIELDS,
          },
        ],
      },
      {
        number: "2",
        heading: "Kargo Ücretinin Hesaplanması",
        blocks: [
          {
            type: "list",
            items: [
              {
                label: "Paket boyutu",
                text: "Satıcı ilanı oluştururken ürünün gönderimine uygun küçük, orta veya büyük paket boyutunu seçer.",
              },
              {
                label: "Aktif tarife",
                text: "Kargo ücreti, ödeme anında yürürlükte olan kargo tarifesi ile seçilen paket boyutuna göre hesaplanır ve sipariş onayından önce alıcıya gösterilir.",
              },
              {
                label: "Birden fazla satıcı",
                text: "Aynı ödeme içinde farklı satıcılardan ürün bulunması hâlinde ürünler satıcı bazında ayrı paketlenebilir; her satıcı paketi için hesaplanan kargo tutarı ödeme özetinde gösterilir.",
              },
              {
                label: "Yanlış paket bilgisi",
                text: "Satıcı, ürünün güvenli taşınmasına ve gerçek boyutuna uygun paket seçmekle yükümlüdür. Taşıyıcının tespit ettiği ölçü farklılıkları kayıt altına alınabilir ve ilgili kullanıcıya yansıtılabilecek sonuçlar işlem koşullarına göre değerlendirilir.",
              },
            ],
          },
          {
            type: "note",
            text: "Kargo için geçerli tutar, ödeme veya takas onayı öncesinde ekranda gösterilen tutardır. Kampanya, tarife ve taşıyıcı değişiklikleri yeni işlemler için farklı bir tutar doğurabilir.",
          },
        ],
      },
      {
        number: "3",
        heading: "Siparişin Hazırlanması ve Kargoya Verilmesi",
        blocks: [
          {
            type: "p",
            text: "Ödeme onaylandığında satıcı için sipariş detayında kesin bir hazırlama son tarihi oluşturulur. Standart akışta bu süre ödeme onayından itibaren üç gündür; işlem ekranında gösterilen tarih ve saat esas alınır. Satıcı ürünü, ilan açıklamasındaki durumunu koruyacak ve taşıma sırasında zarar görmesini önleyecek şekilde paketleyerek kendisine oluşturulan kargo numarasıyla taşıyıcıya teslim eder.",
          },
          {
            type: "p",
            text: "Hazırlama süresi dolduğu hâlde taşıyıcı kayıtlarında gönderinin fiilen hareket ettiği doğrulanamıyorsa sipariş otomatik olarak iptal ve ücret iadesi sürecine alınabilir. Gönderi taşıyıcıya teslim edilmiş ve taşıyıcı sisteminde hareket görmüşse yalnızca satıcının ekrandaki bildirimi eksik diye sipariş otomatik olarak iptal edilmez.",
          },
        ],
      },
      {
        number: "4",
        heading: "Taşıyıcı, Takip ve Tahmini Teslim Süresi",
        blocks: [
          {
            type: "p",
            text: "Tarodan'ın mevcut entegre taşıyıcısı Sürat Kargo'dur. Kargo kaydı oluşturulduğunda veya paket şubede kabul edildiğinde takip numarası sipariş detayında gösterilir. Taşıyıcı kabulünden sonraki standart teslimat tahmini 2–3 iş günüdür; bu süre taahhüt değil tahmindir.",
          },
          {
            type: "list",
            items: [
              {
                text: "Teslimat süresi; adresin bulunduğu il/ilçe, mobil bölge uygulaması, hafta sonu ve resmî tatiller, yoğunluk, hava ve yol koşulları gibi nedenlerle değişebilir.",
              },
              {
                text: "Adres ve iletişim bilgilerinin doğru ve eksiksiz girilmesi alıcının sorumluluğundadır. Adres değişikliği taşıyıcı kabulünden sonra her zaman mümkün olmayabilir.",
              },
              {
                text: "Takip ekranındaki taşıyıcı verisi gecikmeli güncellenebilir. Uzun süre hareket görülmeyen, kayıp veya hasarlı gönderiler için Tarodan destek kanalı üzerinden inceleme açılabilir.",
              },
            ],
          },
        ],
      },
      {
        number: "5",
        heading: "Teslimat ve Hasar Kontrolü",
        blocks: [
          {
            type: "p",
            text: "Teslimat, alıcıya veya alıcının belirlediği üçüncü kişiye yapılabilir. Alıcının sipariş edilen ürünle ilgisi bulunmayan başka bir taşıyıcıyı satıcının sunduğu seçeneklerden bağımsız olarak kendisinin seçtiği durumlar hariç olmak üzere, tüketici işlemlerinde ürünün kaybı veya zarar görmesi riski teslimata kadar satıcıya aittir.",
          },
          {
            type: "p",
            text: "Paket teslim alınırken dış ambalajın ve ürünün mümkün olduğu ölçüde kontrol edilmesi; belirgin ezilme, yırtılma, ıslanma veya eksiklik varsa taşıyıcı görevlisine tutanak düzenletilmesi ve fotoğrafla kayıt altına alınması incelemeyi hızlandırır. Tutanak bulunmaması, emredici mevzuattan doğan ayıplı mal veya diğer tüketici haklarını kendiliğinden ortadan kaldırmaz.",
          },
        ],
      },
      {
        number: "6",
        heading: "Gecikme, İmkânsızlaşma ve Ücret İadesi",
        blocks: [
          {
            type: "p",
            text: "Tüketici işlemlerinde satıcı, ayrıca daha kısa bir süre taahhüt edilmedikçe, siparişi mevzuatta öngörülen azami otuz günlük süre içinde yerine getirir. Ürünün tesliminin imkânsızlaştığı hâllerde tüketiciye mevzuatta öngörülen süre içinde bildirim yapılır ve tahsil edilen bedeller yasal sürede iade edilir. Ürünün yalnızca stokta bulunmaması tek başına ifanın imkânsızlaşması sayılmaz.",
          },
          {
            type: "p",
            text: "İptal veya iade onaylandığında ödeme, kullanılan ödeme yöntemine ve ödeme kuruluşunun işleme süresine bağlı olarak ilgili hesaba yansır. Tarodan iade işleminin platformdaki durumunu sipariş detayında gösterir.",
          },
        ],
      },
      {
        number: "7",
        heading: "Cayma ve İade Gönderileri",
        blocks: [
          {
            type: "p",
            text: "Cayma hakkı ve ayıplı ürüne ilişkin talepler, işlemin niteliğine ve tarafların sıfatına göre değerlendirilir. Tüketici işlemlerinde kanuni cayma süresi ve istisnaları saklıdır; ayrıntılar İade Politikası ile Mesafeli Satış Sözleşmesi'nde yer alır.",
          },
          {
            type: "p",
            text: "İade talebi kabul edildiğinde kullanıcı, sipariş detayında oluşturulan iade kargo numarasını ve gönderim talimatını izlemelidir. Platformun gösterdiği anlaşmalı iade yönteminin kullanılması, gönderinin doğru siparişle eşleştirilmesini ve takip edilebilmesini sağlar. Tüketiciye iade masrafı yüklenip yüklenemeyeceği emredici mevzuata ve sipariş öncesi bilgilendirmeye göre belirlenir.",
          },
        ],
      },
      {
        number: "8",
        heading: "Takas Gönderileri",
        blocks: [
          {
            type: "p",
            text: "Takas kabul edildiğinde her iki taraf kendi ürününü Tarodan'ın belirlediği kontrol noktasına gönderir. Ürünler ulaştığında işlem kaydı ve kontrol akışı tamamlanır; uygun bulunan ürünler karşı tarafa gönderilir. Böylece her takasta iki geliş ve iki dağıtım olmak üzere işlem durumuna göre birden fazla kargo hareketi oluşabilir.",
          },
          {
            type: "list",
            items: [
              {
                text: "Her tarafın ödeyeceği takas kargo ücreti, takasa konu ilanda seçilen paket boyutu ve onay anındaki aktif kargo tarifesi üzerinden hesaplanarak onaydan önce gösterilir.",
              },
              {
                text: "Takas komisyonu ilgili ürünün kategori, işlem tutarı ve satıcı tipi özelliklerine uyan komisyon kuralından; kargo ücreti ise komisyon kuralından bağımsız kargo tarifesinden hesaplanır.",
              },
              {
                text: "Kontrolde uyuşmazlık, iptal veya ret oluşması hâlinde ürünün sahibine geri gönderilmesi için dönüş kargosu oluşturulabilir. Kesin durum, ücret ve takip bilgileri takas detayında gösterilir.",
              },
            ],
          },
        ],
      },
      {
        number: "9",
        heading: "Destek ve Öncelik Sırası",
        blocks: [
          {
            type: "p",
            text: "Kargo kodu, takip, gecikme, kayıp, hasar veya teslimat uyuşmazlığı için hesap içindeki ilgili sipariş ya da takas kaydı üzerinden destek talebi oluşturulabilir. İşleme özel ödeme özeti, sipariş/takas detayı ve taşıyıcı kayıtları; bu genel politikadaki bilgilerle birlikte değerlendirilir. Emredici tüketici mevzuatı her durumda saklıdır.",
          },
        ],
      },
    ],
  },
];

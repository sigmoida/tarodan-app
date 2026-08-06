/** @format */

/**
 * Satıcı sözleşmeleri — kurumsal metnin tek kaynağı.
 *
 * İki ayrı sözleşme var (bireysel / kurumsal) ama komisyon tablosu ikisinde de
 * BİREBİR aynı, o yüzden tablo tek sabit olarak tutulup iki bölümde de
 * gösteriliyor. Oranlar değişirse tek yerden değişir.
 */

export interface AgreementClause {
  /** Kalın basılacak madde adı (örn. "Doğrulama"). */
  label?: string;
  text: string;
}

export interface AgreementSection {
  title: string;
  /** Maddelerden önce gelen açıklama. */
  intro?: string;
  clauses?: AgreementClause[];
  /** Bu bölümün altında komisyon tablosu gösterilsin mi? */
  showFeeTable?: boolean;
}

export interface FeeRow {
  range: string;
  sellerCommission: string;
  buyerCommission: string;
  sellerShipping: string;
  buyerShipping: string;
  sellerServiceFee: string;
  buyerProtectionFee: string;
}

export const FEE_TABLE: FeeRow[] = [
  {
    range: "250 TL – 999 TL",
    sellerCommission: "%6",
    buyerCommission: "%4",
    sellerShipping: "50 TL",
    buyerShipping: "50 TL",
    sellerServiceFee: "%5",
    buyerProtectionFee: "%5",
  },
  {
    range: "1.000 TL – 9.999 TL",
    sellerCommission: "%6",
    buyerCommission: "%4",
    sellerShipping: "50 TL",
    buyerShipping: "50 TL",
    sellerServiceFee: "%5",
    buyerProtectionFee: "%6",
  },
  {
    range: "10.000 TL – 24.999 TL",
    sellerCommission: "%6",
    buyerCommission: "%3",
    sellerShipping: "50 TL",
    buyerShipping: "50 TL",
    sellerServiceFee: "%5",
    buyerProtectionFee: "%4",
  },
  {
    range: "25.000 TL ve üstü",
    sellerCommission: "%3",
    buyerCommission: "%3",
    sellerShipping: "50 TL",
    buyerShipping: "50 TL",
    sellerServiceFee: "%3",
    buyerProtectionFee: "%3",
  },
  {
    range: "Takas",
    sellerCommission: "—",
    buyerCommission: "—",
    sellerShipping: "100 TL",
    buyerShipping: "100 TL",
    sellerServiceFee: "150 TL",
    buyerProtectionFee: "150 TL",
  },
];

export const INDIVIDUAL_INTRO =
  "Tarodan platformunda bireysel olarak model araç koleksiyonlarını sergilemek, satış yapmak ve takas işlemlerini gerçekleştirmek isteyen kullanıcılarımız için hazırlanan Bireysel Satıcı Sözleşmesi aşağıda yer almaktadır.";

export const INDIVIDUAL_AGREEMENT: AgreementSection[] = [
  {
    title: "1. Taraflar ve Kapsam",
    intro:
      "İşbu sözleşme, Tarodan platformu (“Platform”) ile koleksiyonundaki model araçları (Hot Wheels, die-cast, ölçekli araçlar vb.) ticari bir işletme olmaksızın, kişisel koleksiyon amaçlı veya bireysel olarak satışa çıkaran Kullanıcı (“Bireysel Satıcı”) arasında akdedilmiştir.",
  },
  {
    title: "2. Bireysel Satıcı Onboarding ve Hesap Açılışı",
    clauses: [
      {
        label: "Bilgi ve Belge Talebi",
        text: "Bireysel satıcılar, platforma kayıt olurken ad-soyad, T.C. kimlik numarası, güncel iletişim bilgileri (e-posta, telefon) ve ödemelerin aktarılması için kendi adlarına kayıtlı geçerli IBAN/banka hesap bilgilerini eksiksiz olarak bildirmekle yükümlüdür.",
      },
      {
        label: "Doğrulama",
        text: "Tarodan, güvenlik ve yasal uyumluluk gereği bireysel satıcılardan ek kimlik doğrulaması talep etme hakkını saklı tutar.",
      },
    ],
  },
  {
    title: "3. Ürün Listeleme, Kondisyon ve Şeffaflık",
    clauses: [
      {
        text: "Bireysel satıcı, ilanını açtığı model aracın markasını, modelini, ölçeğini ve kondisyonunu doğru ve eksiksiz olarak girmek zorundadır.",
      },
      {
        text: "Modelde veya orijinal kutusunda çizik, kırık, eksik parça gibi herhangi bir kusur mevcutsa, bunlar ilanda açıkça belirtilmeli ve fotoğraflarla gösterilmelidir. Şeffaflık ilkesine aykırı hareketlerden doğan sorumluluk tamamen satıcıya aittir.",
      },
    ],
  },
  {
    title: "4. Paketleme ve Kargo Süreçleri",
    clauses: [
      {
        text: "Satıcı, satışı gerçekleşen modeli baloncuklu naylon, köpük ve sağlam karton kutu kullanarak kargo sürecinde zarar görmeyecek şekilde özenle paketlemekle yükümlüdür.",
      },
      {
        text: "Satışı yapılan ürün, en geç 3 iş günü içinde kargoya teslim edilmeli ve kargo takip numarası sistem üzerinden paylaşılmalıdır.",
      },
    ],
  },
  {
    title: "5. Güvenli Ödeme ve Havuz Sistemi",
    clauses: [
      {
        text: "Satış bedeli, alıcı ürünü teslim alıp onay verene kadar 14 gün Tarodan’ın güvenli havuz hesabında muhafaza edilir.",
      },
      {
        text: "Havale, EFT veya elden ödeme gibi platform dışı ödeme yöntemleri kesinlikle yasaktır. Alıcı onayından sonra, komisyon ve hizmet bedelleri düşülerek net tutar satıcının hesabına aktarılır.",
      },
    ],
  },
  {
    title: "6. Takas Süreçleri",
    clauses: [
      {
        text: "“Takas Açık” olarak listelenen ürünlerde taraflar anlaştıktan sonra araçlar Tarodan merkez deposuna gönderilir. Depo uzmanlarının yaptığı kontroller sonucunda onaylanan takas süreçleri resmi olarak tamamlanır.",
      },
    ],
  },
  {
    title: "7. Yaptırımlar ve Askıya Alma",
    clauses: [
      {
        text: "Gecikmeli kargolama, yanıltıcı ilan bilgileri veya platform dışı ödeme yönlendirmesi gibi riskli davranışlar tespit edildiğinde satıcının hesabı geçici olarak askıya alınabilir veya kalıcı olarak kapatılabilir.",
      },
    ],
  },
  {
    title: "8. Komisyon, Hizmet Bedelleri ve Güvenli Ödeme Havuzu",
    clauses: [
      {
        text: "Tüm tahsilatlar Tarodan güvenli ödeme altyapısı üzerinden yapılır.",
      },
      {
        text: "Bireysel satışlar üzerinden kesilecek komisyon oranları, hizmet bedelleri ve hak ediş transfer takvimi, taraflar arasında akdedilen ticari koşullara ve mağaza anlaşmasına göre yürütülür. Ödemeler havuz sisteminden onay akışına bağlı olarak serbest bırakılır.",
      },
    ],
    showFeeTable: true,
  },
];

export const CORPORATE_INTRO =
  "Tarodan platformunda ticari unvanı ile mağaza açarak model araç satışı gerçekleştiren profesyonel işletmeler için hazırlanan Kurumsal Satıcı Sözleşmesi aşağıda yer almaktadır.";

export const CORPORATE_AGREEMENT: AgreementSection[] = [
  {
    title: "1. Taraflar ve Kapsam",
    intro:
      "İşbu sözleşme, Tarodan platformu (“Platform”) ile platformda ticari faaliyet yürütmek amacıyla mağaza açan, vergi mükellefi tüzel veya gerçek kişi satıcı (“Kurumsal Satıcı”) arasında akdedilmiştir.",
  },
  {
    title: "2. Kurumsal Onboarding, Doğrulama ve Belge Yükümlülüğü",
    intro:
      "Kurumsal satıcılar, 6563 sayılı Kanun ve ilgili e-ticaret mevzuatına tam uyum sağlamak amacıyla platforma aşağıdaki bilgi ve belgeleri ibraz etmek zorundadır:",
    clauses: [
      {
        label: "Şirket ve Vergi Bilgileri",
        text: "Vergi levhası, ticaret sicil gazetesi, imza sirküleri, unvan, vergi dairesi ve vergi numarası, faaliyet belgesi.",
      },
      {
        label: "Yasal İletişim Bilgileri",
        text: "Kayıtlı elektronik posta (KEP) adresi, MERSİS numarası, kurumsal telefon ve tebligat adresi.",
      },
      {
        label: "Finansal Bilgiler",
        text: "Şirket unvanına tescilli resmi banka hesap bilgileri (IBAN).",
      },
      {
        text: "Kurumsal satıcı, sunduğu belgelerin doğruluğunu taahhüt eder; bilgilerde meydana gelen değişiklikleri derhal platforma bildirmekle yükümlüdür.",
      },
    ],
  },
  {
    title: "3. Yasal ve Ticari Sorumluluklar",
    clauses: [
      {
        label: "Fatura ve Vergi Yükümlülüğü",
        text: "Kurumsal satıcı, platform üzerinden gerçekleştirdiği tüm satışlar için alıcı adına yasal fatura düzenlemek ve e-fatura/e-arşiv mevzuatına uymakla yükümlüdür. Vergi beyanı ve mali yükümlülüklerin tüm sorumluluğu kurumsal satıcıya aittir.",
      },
      {
        label: "Tüketici Hakları ve Garanti",
        text: "6502 sayılı Tüketicinin Korunması Hakkında Kanun hükümlerine uymak, cayma haklarını eksiksiz uygulamak ve ürünlerin orijinal/garantili olmasından kurumsal satıcı doğrudan sorumludur.",
      },
    ],
  },
  {
    title: "4. İlan, Stok ve Fiyatlandırma Standartları",
    clauses: [
      {
        text: "Kurumsal satıcılar, stoklarında yer alan ürünleri güncel fiyat ve detay bilgileriyle listelemek zorundadır. Yanıltıcı stok veya fiyatlandırma politikaları uygulanamaz.",
      },
      {
        text: "Ürün görsellerinde telif haklarına uygun, profesyonel veya net ürün fotoğrafları kullanılmalıdır.",
      },
    ],
  },
  {
    title: "5. Paketleme, Lojistik ve Operasyonel Süreçler",
    clauses: [
      {
        text: "Kurumsal satıcı, yüksek hacimli siparişlerde dahi koleksiyoner hassasiyetine uygun standartlarda paketleme yapmak ve siparişleri taahhüt edilen süreler (3 iş günü) içerisinde kargoya teslim etmekle yükümlüdür.",
      },
      {
        text: "Kargo takip numaralarının sisteme zamanında girilmesi zorunludur.",
      },
    ],
  },
  {
    title: "6. Komisyon, Hizmet Bedelleri ve Güvenli Ödeme Havuzu",
    clauses: [
      {
        text: "Tüm tahsilatlar Tarodan güvenli ödeme altyapısı üzerinden yapılır.",
      },
      {
        text: "Kurumsal satışlar üzerinden kesilecek komisyon oranları, hizmet bedelleri ve hak ediş transfer takvimi, taraflar arasında akdedilen ticari koşullara ve mağaza anlaşmasına göre yürütülür. Ödemeler havuz sisteminden onay akışına bağlı olarak serbest bırakılır.",
      },
    ],
    showFeeTable: true,
  },
  {
    title: "7. Denetim, Risk Yönetimi ve Hesabın Askıya Alınması",
    clauses: [
      {
        text: "Kurumsal satıcının sahte/replika ürün satması, müşteri şikayetlerini sistematik olarak çözümsüz bırakması, mevzuata aykırı ticari faaliyetlerde bulunması veya platform dışı ödeme talep etmesi durumunda Tarodan, önceden ihtara gerek olmaksızın mağazayı geçici olarak askıya alma veya sözleşmeyi tek taraflı feshederek hesabı kalıcı olarak kapatma hakkına sahiptir.",
      },
    ],
  },
];

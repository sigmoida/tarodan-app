/** @format */

/**
 * SSS içeriği — tek kaynak.
 *
 * Sayfa eskiden CMS'ten (`/api/pages/faq`) besleniyordu; metin kurumsal olarak
 * sabitlendiği için artık burada duruyor. Bölüm `id`'leri dış bağlantılar
 * (Yardım & Destek konu listeleri) tarafından anchor olarak kullanılır.
 */

export interface FaqEntry {
  q: string;
  /** Cevap paragrafları — sırayla basılır. */
  a: string[];
  /** Paragraflardan sonra gelen madde listesi (etiket kalın). */
  bullets?: { label?: string; text: string }[];
}

export interface FaqSection {
  id: string;
  title: string;
  entries: FaqEntry[];
}

export const FAQ_SECTIONS: FaqSection[] = [
  {
    id: "alisveris-takas",
    title: "Alışveriş ve Takas Rehberi",
    entries: [
      {
        q: "Nasıl sipariş oluşturabilirim?",
        a: [
          "Koleksiyonunuza dahil etmek istediğiniz model araçları sepetinize ekleyerek alışverişe hemen başlayabilirsiniz. Sepetinize tıkladıktan sonra aktif indirimlerden yararlanabilir, varsa indirim kuponu kodunuzu ilgili alana girebilirsiniz.",
          "“Ödemeye geç” butonuna tıkladıktan sonra teslimat adresinizi kontrol edebilir; farklı bir adrese gönderim yapacaksanız yeni bir adres ekleyebilir veya mevcut bilgilerinizi güncelleyebilirsiniz. Ödeme adımında kart bilgilerinizi girdikten ve dilerseniz size uygun taksit seçeneğini seçtikten sonra “Alışverişi tamamla” butonuna basarak siparişinizi güvenle oluşturabilirsiniz.",
        ],
      },
      {
        q: "Takas işlemlerini nasıl yapıyoruz?",
        a: [
          "Heyecan verici bir diğer detay ise: koleksiyonlar arası takas da yapılabiliyor! Takas sürecinde her iki taraf da model araçlarını Tarodan deposuna gönderiyor. Uzman ekibimiz depoda gerekli kontrolleri sağlıyor; ürünler ilanla tamamen eşleşiyorsa takas işlemini güvenle başlatıyoruz. Eğer beklenmeyen kusurlu veya yanlış bir ürünle karşılaşırsak hemen taraflara bilgi veriyor, onayınızla süreci düzenliyor veya ürünleri güvenle sizlere iade ediyoruz. Böylece garaj değiştirmek tamamen güvence altında ilerliyor!",
        ],
      },
      {
        q: "Siparişimin veya takasımın durumunu nasıl takip edebilirim?",
        a: [
          "Tarodan uygulamasını açtıktan sonra siparişleriniz için Hesabım → Siparişlerim, takaslarınız için Hesabım → Takaslarım adımlarını izleyerek yeni göz bebeğinizin yolda olup olmadığını ya da takas sürecini anlık olarak takip edebilirsiniz.",
        ],
      },
      {
        q: "Tek sepette birden fazla model alabilir miyim?",
        a: [
          "Evet, sepetinizdeki tüm güzellikleri ve takas ürünlerini tek seferde ödeyerek kargoyla kapınıza gelmesini sağlayabilirsiniz.",
        ],
      },
      {
        q: "Ödenecek tutarı model fiyatından neden daha yüksek görüyorum?",
        a: [
          "Seçtiğiniz modelin fiyatı dışında; kargo gönderim kuralları, aktif kampanyalar veya paketleme/hizmet bedeli gibi detaylar sepet toplamına yansıyabilir. Ödeme adımına geçmeden önce tüm dökümü net bir şekilde görebilirsiniz.",
        ],
      },
      {
        q: "Ödeme işlemleri nasıl gerçekleştirilir?",
        a: [
          "Ödemelerinizi Tarodan’ın güvenli altyapısını kullanarak kredi veya banka kartınızla kolayca yapabilirsiniz. Havale veya EFT seçeneğimiz bulunmuyor.",
        ],
      },
      {
        q: "Gözüm gibi baktığım ödemem güvende mi?",
        a: [
          "Kesinlikle! Siz modelinize kavuşup siparişe onay verene kadar ödemeniz Tarodan’ın güvenli havuzunda titizlikle saklanır. Siz “Her şey yolunda” demeden hiçbir tutar karşı tarafa aktarılmaz.",
        ],
      },
      {
        q: "Kargo gönderim ücretini kim öder?",
        a: [
          "Kargo ücreti, ilanı oluştururken satıcının tercihine göre değişiklik gösterir. İlan detaylarında kargonun alıcıya mı ait olduğu yoksa satıcı tarafından mı karşılandığı net bir şekilde belirtilir. Alışveriş yapmadan önce bu detayı inceleyerek kargo maliyetini kolayca görebilirsiniz.",
        ],
      },
      {
        q: "Siparişim ne zaman kargolanır?",
        a: [
          "Satıcınız modelinizi özenle paketleyip hazırladıktan sonra, genellikle yasal ve platform kuralları gereği 3 iş günü içinde kargoya teslim eder. Garajınıza katılacak yeni parçanın yola çıkış tarihini satıcınızla mesajlaşarak da teyit edebilirsiniz.",
        ],
      },
      {
        q: "Kargomu nasıl takip edebilirim?",
        a: [
          "Modeliniz kargoya verildikten sonra sistem üzerinde bir takip numarası oluşturulur. Tarodan uygulamasını açarak Hesabım → Siparişlerim veya Hesabım → Takaslarım adımlarını izleyebilir, kargonuzun adım adım garajınıza yaklaşmasını anlık olarak takip edebilirsiniz.",
        ],
      },
      {
        q: "Sipariş ne zaman tamamlanır?",
        a: [
          "Kargonuz kapıya geldi, bitti sandınız değil mi? Aslında süreç, kargonuzu teslim alıp modeli inceledikten ve sistem üzerinden “Siparişi Onayla” butonuna bastıktan sonra resmi olarak tamamlanır. Göz bebeğinizin kutusundan sağ salim çıktığından emin olunca süreci tamamlayabilirsiniz.",
        ],
      },
      {
        q: "Ödemem satıcıya ne zaman geçer?",
        a: [
          "Siz kargonuzu teslim alıp “Her şey yolunda, siparişi onaylıyorum” diyene kadar ödemeniz Tarodan’ın güvenli havuzunda titizlikle saklanır. Onay butonuna bastığınız anda ödemeniz güvenle satıcının hesabına aktarılır.",
        ],
      },
      {
        q: "Ne zaman iade talebi oluşturabilirim?",
        a: [
          "Beklenmeyen bir durumla karşılaştığınızda veya ürün ilanla uyuşmadığında, kargonuzu teslim aldığınız andan itibaren geçerli olan yasal süre 14 gün içinde iade talebi oluşturabilirsiniz. Tarodan ekibi ve güvenli altyapımız bu süreçte her iki tarafın da haklarını korumak için devrededir.",
        ],
      },
      {
        q: "Alıcı hizmet bedeli ve satıcı komisyonu nedir?",
        a: [
          "Platformun güvenli altyapısını, ödeme havuzu sistemini ve sunduğumuz tüm operasyonel kolaylıkları sürdürebilmek adına cüzi bir hizmet bedeli ve komisyon oranları uygulanmaktadır. Tüm bu kesintiler ve tutarlar, ödeme onay adımından önce şeffaf bir şekilde ekranınızda gösterilir; sürprizlerle karşılaşmazsınız.",
        ],
      },
    ],
  },
  {
    id: "populer-konular",
    title: "Popüler Konular",
    entries: [
      {
        q: "İlk satışımı nasıl yaparım?",
        a: [
          "Garajınızda yeni sahiplerini bekleyen model araçlar için “İlan Ver” butonuna tıklayarak ilk adımınızı atabilirsiniz. Aracın markasını, modelini, ölçeğini ve kondisyonunu eksiksiz girip, farklı açılardan çekilmiş en az 3 net fotoğraf ekledikten sonra rekabetçi bir fiyat belirleyerek ilanınızı yayına alabilirsiniz. Satış gerçekleştikten sonra modeli özenle paketleyip kargoya vermeniz ve size iletilen kargo kodunu kargo şubesindeki yetkililerle paylaşmanız yeterlidir; ilk satışınız böylece başarıyla tamamlanır!",
        ],
      },
      {
        q: "Ürünlerimi nasıl ön plana çıkartırım?",
        a: [
          "Garajınızdaki model araçların hak ettiği değeri görmesi ve hızla yeni sahibine ulaşması için İlanı Öne Çıkar seçeneğini kullanabilirsiniz. Ürününüzün fiyat aralığına ve vitrinde kalmasını istediğiniz süreye (7 gün veya 30 gün) göre dilediğiniz paketi seçerek ilanınızı öne çıkarabilir, koleksiyonerlerin dikkatini anında üzerinize çekebilirsiniz.",
          "Kısa süreli ve hızlı bir ivme yakalamak isteyenler için 7 günlük paketler:",
        ],
        bullets: [
          {
            label: "200 – 999 TL arası ürünler",
            text: "Ana Sayfa Öne Çıkarılanlar 150 TL · Ana Sayfa Vitrin 350 TL",
          },
          {
            label: "1.000 – 5.000 TL arası ürünler",
            text: "Ana Sayfa Öne Çıkarılanlar 250 TL · Ana Sayfa Vitrin 500 TL",
          },
          {
            label: "5.000 TL ve üzeri nadide parçalar",
            text: "Ana Sayfa Öne Çıkarılanlar 500 TL · Ana Sayfa Vitrin 1.000 TL",
          },
        ],
      },
      {
        q: "30 günlük öne çıkarma paketleri nelerdir?",
        a: [
          "Modelinizi uzun soluklu bir vitrin deneyimiyle sergilemek ve doğru koleksiyonere ulaşana kadar göz önünde tutmak istiyorsanız 30 günlük paketlerimiz tam size göre:",
        ],
        bullets: [
          {
            label: "200 – 999 TL arası ürünler",
            text: "Ana Sayfa Öne Çıkarılanlar 550 TL · Ana Sayfa Vitrin 1.200 TL",
          },
          {
            label: "1.000 – 5.000 TL arası ürünler",
            text: "Ana Sayfa Öne Çıkarılanlar 750 TL · Ana Sayfa Vitrin 1.900 TL yerine kampanyalı 1.750 TL",
          },
          {
            label: "5.000 TL ve üzeri nadide parçalar",
            text: "Ana Sayfa Öne Çıkarılanlar 1.900 TL · Ana Sayfa Vitrin 3.750 TL",
          },
        ],
      },
      {
        q: "Takas teklifi nasıl gönderirim?",
        a: [
          "Ürün listelerinde veya detay sayfalarında “Takas Açık” etiketini gördüğünüz model araçlara anında teklif iletebilirsiniz. İlgilendiğiniz modelin sayfasındaki “Takas Teklifi” butonuna tıklayarak kendi garajınızdan uygun bir ürün seçebilir ve teklifinizi karşı tarafa gönderebilirsiniz. Taraflar takas ürünü ve fiyatı noktasında anlaştıktan sonra ürünler kontrol için Tarodan deposuna gönderilir ve süreç güvenle başlar.",
        ],
      },
      {
        q: "Üyelik planları arasındaki farklar nelerdir?",
        a: [
          "Tarodan’da koleksiyonunuzu sergilemek, alışveriş yapmak ve takas sistemini kullanmak temel üyelik yapımızla tamamen sorunsuz bir şekilde ilerler. Farklı plan seçeneklerimiz; ilan öne çıkarma (roketleme) hakları, mağaza ayrıcalıkları ve gelişmiş sergileme özellikleri gibi detaylarda koleksiyonerlere esneklik sunar. İhtiyacınıza en uygun planı profilinizden inceleyerek seçebilirsiniz.",
        ],
      },
      {
        q: "Siparişimi nasıl takip ederim?",
        a: [
          "Yeni göz bebeğinizin yola çıkış heyecanını anlık olarak yaşayabilirsiniz! Tarodan uygulamasını açtıktan sonra siparişleriniz için Hesabım → Siparişlerim, takas işlemleriniz için ise Hesabım → Takaslarım adımlarını izleyerek kargonuzun nerede olduğunu ve adım adım size nasıl yaklaştığını canlı olarak takip edebilirsiniz.",
        ],
      },
      {
        q: "İade ve değişim politikası nedir?",
        a: [
          "Koleksiyon tutkunluğunun ne kadar hassas bir hobi olduğunu biliyoruz. Beklenmeyen bir kusurla karşılaştığınızda veya ürün ilan bilgileriyle uyuşmadığında, teslimat anından itibaren geçerli olan yasal süre 14 gün çerçevesinde iade veya değişim talebi oluşturabilirsiniz. Tarodan ekibi, güvenli altyapısı ve depo kontrolleri ile bu süreçte her iki tarafın da haklarını titizlikle korur.",
        ],
      },
    ],
  },
];

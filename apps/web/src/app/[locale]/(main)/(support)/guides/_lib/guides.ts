/** @format */

export interface GuideStep {
  title: string;
  content: string;
}

export interface Guide {
  /** Anchor id — /support ve FAQ sayfalarından `#selling` gibi linklenir. */
  id: string;
  title: string;
  steps: GuideStep[];
}

export const GUIDES: Guide[] = [
  {
    id: "getting-started",
    title: "Başlangıç Rehberi",
    steps: [
      {
        title: "Üye Olun",
        content:
          "E-posta adresiniz ve şifrenizle hızlıca kayıt olabilir ya da Google veya Facebook hesabınızla tek tıkla aramıza katılabilirsiniz.",
      },
      {
        title: "Profilinizi Tamamlayın",
        content:
          "Profil fotoğrafınızı ekleyin, hobinizden kısaca bahseden bir biyografi yazın ve iletişim bilgilerinizi güncelleyin. Eksiksiz profiller, platformdaki güvenilirliğinizi her zaman bir adım öne taşır.",
      },
      {
        title: "Adres Ekleyin",
        content:
          "Koleksiyonunuza yeni parçalar eklemek veya takas süreçlerini başlatabilmek için sistemimize en az bir teslimat adresi tanımlayın.",
      },
      {
        title: "Keşfetmeye Başlayın",
        content:
          "Zengin kategorilerimizi inceleyin, favori satıcılarınızı takibe alın ve gözünüze kestirdiğiniz nadir modelleri favorilerinize kaydederek hemen keşfe başlayın.",
      },
    ],
  },
  {
    id: "buying",
    title: "Alışveriş Rehberi",
    steps: [
      {
        title: "Model Arayın",
        content:
          "Arama çubuğunu kullanarak aradığınız markayı, özel seriyi veya modeli yazın; gelişmiş filtrelerle aradığınız parçaya saniyeler içinde ulaşın.",
      },
      {
        title: "Detayları İnceleyin",
        content:
          "Modelin fotoğraflarını yakından inceleyin, satıcının açıklamalarına göz atın ve satıcı puanını kontrol edin. Aklınıza takılan en ufak bir soru olursa mesaj yoluyla satıcıyla kolayca iletişime geçin.",
      },
      {
        title: "Sepetinize Ekleyin",
        content:
          "Beğendiğiniz modeli “Sepete Ekle” butonuna tıklayarak sepetinize atın. Dilerseniz aynı satıcıya ait birden fazla modeli tek seferde sepetinizde toplayabilirsiniz.",
      },
      {
        title: "Ödemenizi Tamamlayın",
        content:
          "Teslimat adresinizi seçin, size uygun kargo tercihini belirleyin ve güvenli ödeme adımıyla işleminizi sorunsuzca tamamlayın.",
      },
      {
        title: "Siparişinizi ve Takaslarınızı Takip Edin",
        content:
          "“Siparişlerim” ve “Takaslarım” sayfasını ziyaret ederek yeni modelinizin yola çıkış ve kargo sürecini anlık olarak takip edin.",
      },
    ],
  },
  {
    id: "selling",
    title: "Satış Rehberi",
    steps: [
      {
        title: "İlan Verin",
        content:
          "Ana sayfada veya menüde yer alan “İlan Ver” butonuna tıklayarak hızlıca ilan oluşturma sayfasına geçiş yapın.",
      },
      {
        title: "Fotoğraf Ekleyin",
        content:
          "Modelinizi en iyi şekilde yansıtan, farklı açılardan ve net ışık altında çekilmiş en az 3 fotoğraf yükleyin; kaliteli görseller her zaman dikkat çeker ve satış şansınızı artırır.",
      },
      {
        title: "Detayları Girin",
        content:
          "Marka, model, ölçek, kondisyon ve açıklama bilgilerini eksiksiz şekilde doldurun. Paylaştığınız her detay, alıcı gözünde güvenilirliğinizi artırır.",
      },
      {
        title: "Fiyat Belirleyin",
        content:
          "Piyasa araştırması yaparak rekabetçi bir fiyat belirleyin. Dilerseniz koleksiyonunuzu çeşitlendirmek için takas seçeneğini de aktif hale getirebilirsiniz.",
      },
      {
        title: "İlanınızı Yayınlayın",
        content:
          "İlanınız hızlı bir onay sürecinden geçtikten sonra (genellikle 24 saat içinde) vitrindeki yerini alır.",
      },
      {
        title: "Satışı Tamamlayın",
        content:
          "Satış gerçekleştiğinde modeli özenle paketleyin, kargoya teslim edin ve takip numarasını sisteme girerek süreci tamamlayın.",
      },
    ],
  },
  {
    id: "trade",
    title: "Takas Rehberi",
    steps: [
      {
        title: "Takasa Açık Ürünleri Keşfedin",
        content:
          "Ürün listelerinde yer alan “Takas” etiketine dikkat edin. Beğendiğiniz bu modellere hemen takas teklifi gönderebilirsiniz.",
      },
      {
        title: "Teklifinizi Gönderin",
        content:
          "“Takas Teklifi” butonuna tıklayın, kendi garajınızdan veya ilanlarınızdan takas için uygun bir ürün seçerek teklifinizi iletin.",
      },
      {
        title: "Detayları Görüşün",
        content:
          "Karşı tarafla mesajlaşarak takas koşullarını detaylandırın. Eğer model değerleri arasında fark varsa, ek ödeme konusunda anlaşma sağlayın.",
      },
      {
        title: "Takası Onaylayın",
        content:
          "Her iki taraf da şartları onayladığında takas resmi olarak kesinleşir.",
      },
      {
        title: "Güvenli Gönderim Sağlayın",
        content:
          "Ürünlerinizi güvenle paketleyerek kargoya verin. Tarodan güvenli depo incelemesi için depomuza ulaşan ürünlerin kontrolleri tamamlandıktan sonra onayınızı verin ve kargo takip numaraları üzerinden modelinizin size ne zaman ulaşacağını sistemden takip edin.",
      },
    ],
  },
  {
    id: "photography",
    title: "Fotoğraf Çekim Rehberi",
    steps: [
      {
        title: "Doğal Işık Kullanın",
        content:
          "Çekimlerinizde mutlaka doğal ışıktan yararlanın; gündüz vakti pencere kenarında yapılan çekimler modelin detaylarını en net şekilde ortaya çıkarır. Flaş kullanmaktan kaçının.",
      },
      {
        title: "Sade Bir Arka Plan Tercih Edin",
        content:
          "Modelin detaylarının ön plana çıkması için sade ve tek renkli bir arka plan kullanın. Beyaz bir kağıt veya kumaş bu işlem için fazlasıyla yeterlidir.",
      },
      {
        title: "Farklı Açılardan Çekim Yapın",
        content:
          "Modelinizi ön, arka, yan ve 45 derecelik açılardan fotoğraflayın. İnce detayları ve hatları net bir şekilde göstererek alıcıya eksiksiz bir sunum yapın.",
      },
      {
        title: "Kusurları Şeffafça Gösterin",
        content:
          "Modelde çizik veya eksik parça gibi kusurlar varsa bunları yakından fotoğraflayın. Şeffaflık, koleksiyonerler arasında her zaman güven sağlar.",
      },
      {
        title: "Orijinal Kutuyu Unutmayın",
        content:
          "Modelin orijinal kutusu varsa mutlaka fotoğraflayın; kutulu ürünler koleksiyoncular için her zaman çok daha değerlidir.",
      },
    ],
  },
  {
    id: "shipping",
    title: "Kargo Rehberi",
    steps: [
      {
        title: "Doğru Koruyucu Malzeme Kullanın",
        content:
          "Modelinizi baloncuklu naylon, köpük veya gazete kağıdıyla sıkıca sarın; kutu içinde kesinlikle hareket etmemesini sağlayın.",
      },
      {
        title: "Uygun Boyutta Sağlam Kutu Seçin",
        content:
          "Ürünün ebatlarına uygun, dayanıklı bir karton kutu tercih edin. Çok büyük kutular modelin taşıma sırasında darbe almasına yol açabilir.",
      },
      {
        title: "Çift Kat Koruma Tercih Edin",
        content:
          "Özellikle koleksiyonunuzdaki değerli ve nadir parçalar için iç içe iki kutu kullanarak ekstra güvenlik sağlayın.",
      },
      {
        title: "Net Etiketleme Yapın",
        content:
          "Gönderici ve alıcı adres bilgilerini okunaklı bir şekilde yazın; kutunun üzerine mutlaka “KIRILACAK EŞYA” uyarısı ekleyin.",
      },
      {
        title: "Kargoya Teslim Edin",
        content:
          "Paketinizi kargo şubesine götürerek size atanan kargo kodu ile şubeye teslim edin.",
      },
    ],
  },
];

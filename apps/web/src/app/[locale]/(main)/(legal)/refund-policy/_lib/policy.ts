/** @format */

/**
 * İade ve iptal koşulları — kurumsal metnin tek kaynağı.
 *
 * Yapı bilinçli olarak soru-cevap: sayfa metin ağırlıklı, her madde bir başlık
 * ve altındaki paragraf/liste. Etiketli maddelerde (`label`) etiket kalın
 * basılır, böylece "hangi durumda kim öder" tablosu okunur kalır.
 */

export interface PolicyBullet {
  /** Kalın basılacak durum adı (örn. "Teslimat Tarihi Gecikti"). */
  label?: string;
  text: string;
}

export interface PolicyEntry {
  q: string;
  /** Listeden önce gelen açıklama. */
  a?: string;
  bullets?: PolicyBullet[];
  /** Listeden sonra gelen kapanış cümlesi. */
  note?: string;
}

export const RETURN_POLICY: PolicyEntry[] = [
  {
    q: "Hangi koşullarda iade talebi oluşturulabilir?",
    a: "Koleksiyonunuza eklediğiniz model aracın ilandaki tanımlara uymaması, belirtilmeyen bir kusur barındırması veya kargo sürecinde zarar görmesi durumunda yasal süreler içinde iade talebi oluşturabilirsiniz. Aşağıdaki haklı gerekçelerle iade sürecini güvenle başlatabilirsiniz:",
    bullets: [
      { text: "Ürünün tanıma ve görsele uymaması" },
      { text: "İlanda belirtilmemiş kusur veya hasar bulunması" },
      { text: "Eksik ürün veya parça gönderilmesi" },
      { text: "Sahte ürün veya parça tespiti" },
      { text: "Çalışmayan veya arızalı ürün çıkması" },
      { text: "Alıcının cayma hakkını kullanarak “Vazgeçtim” demesi" },
      { text: "Kullanıcı kaynaklı hasar durumları" },
    ],
  },
  {
    q: "Ne zaman iade talebi oluşturabilirim?",
    a: "Kargonuzu teslim aldığınız andan itibaren, yasal mevzuat ve platform kuralları çerçevesinde belirlenen 14 günlük süre içinde sistem üzerinden kolayca iade talebi oluşturabilirsiniz. Göz bebeğinizi kutusundan çıkarıp inceledikten sonra herhangi bir uyumsuzluk fark ederseniz vakit kaybetmeden talep açabilirsiniz.",
  },
  {
    q: "İade talebi nasıl oluşturulur?",
    a: "Tarodan uygulamasını açarak Hesabım → Siparişlerim adımlarını izleyin. İlgili siparişin detayına girdikten sonra “İade Talebi Oluştur” butonuna tıklayın. Karşınıza çıkan listeden iade nedeninizi seçip, sorunu net bir şekilde gösteren güncel fotoğrafları sisteme yükleyerek talebinizi tek tıkla gönderebilirsiniz.",
  },
  {
    q: "İade talebi nasıl değerlendirilir?",
    a: "Oluşturduğunuz iade talebi ve belirttiğiniz gerekçe, Tarodan uzman destek ekibi ve depo kontrol mekanizmaları tarafından titizlikle incelenir. Gerekli görülmesi durumunda ürün merkez depomuza çağrılarak ilan bilgileriyle karşılaştırılır. Sürecin adil ve şeffaf yürütülmesi için hem alıcının hem de satıcının sunduğu kanıtlar değerlendirilerek nihai karar verilir.",
  },
  {
    q: "İade talebi ne kadar sürede sonuçlanır?",
    a: "İade talebiniz sisteme ulaştığı andan itibaren ekibimiz tarafından incelemeye alınır. Genellikle başvurular ve ürünün depoya ulaşarak kontrol edilmesi süreçleri dahil olmak üzere, talepleriniz en geç 3 ila 5 iş günü içinde sonuçlandırılır ve tarafınıza bilgilendirme yapılır.",
  },
  {
    q: "İade talebi kabul edilen alıcı ne yapmalıdır?",
    a: "İade talebiniz onaylandığında, sistem tarafından size iletilen anlaşmalı kargo iade kodunu not almalısınız. Modeli, orijinal kutusu ve tüm parçalarıyla birlikte özenle paketleyerek kargo şubesine teslim etmeniz ve iade takip numarasını sisteme girmeniz yeterlidir.",
  },
  {
    q: "İade gönderimi için ödeme yapmam gerekiyor mu?",
    a: "İade kargo ücretinin kimin tarafından ödeneceği, iade nedeninize göre değişiklik gösterir:",
    bullets: [
      {
        label: "Tanıma uymayan, kusurlu, eksik, sahte veya arızalı ürün",
        text: "iadelerinde kargo bedeli satıcı tarafından ödenir.",
      },
      {
        label: "“Vazgeçtim” veya kullanıcı kaynaklı hasar",
        text: "durumlarında ise kargo gönderim ücreti alıcıya aittir.",
      },
    ],
  },
  {
    q: "İade edilen siparişin ücret iadesi ne zaman yapılır?",
    a: "İade edilen ürün merkeze ulaştıktan ve uzman ekibimiz tarafından onaylandıktan sonra, ödemeniz Tarodan’ın güvenli havuzundan çözülerek bankanıza talimat verilir. Ücretin hesabınıza yansıma süresi, bankanızın süreçlerine bağlı olarak genellikle 1 ila 3 iş günü sürmektedir.",
  },
  {
    q: "İade edilen tutar neden daha düşük?",
    a: "İade onaylandığında yapılan kesintiler, iadenin sebebine ve platform operasyon süreçlerine dayanarak şu şekilde uygulanır:",
    bullets: [
      {
        label: "Tanıma uymayan / kusurlu / eksik / sahte / arızalı ürünler",
        text: "Bu haklı durumlarda kargo masrafını satıcı öder ve işlem sonucunda satıcıdan “Satıcı Platform Hizmet Bedeli” kesintisi yapılır.",
      },
      {
        label: "Kullanıcı kaynaklı hasar / “Vazgeçtim” durumları",
        text: "Bu durumlarda iade kargo ücretini alıcı öder ve iade tutarından “Alıcı Koruma Hizmet Bedeli” kesilerek kalan tutar hesabınıza yansıtılır.",
      },
    ],
  },
];

export const CANCELLATION_POLICY: PolicyEntry[] = [
  {
    q: "Hangi koşullarda iptal talebi oluşturulabilir?",
    a: "Siparişinizi verdikten sonra, ürün henüz kargoya verilmeden veya teslimat sürecinde haklı gerekçelerle iptal talebi oluşturabilirsiniz. Tarodan platformunda geçerli olan iptal nedenlerimiz şunlardır:",
    bullets: [
      { text: "Teslimat tarihi gecikti" },
      { text: "Yanlış ürün seçtim" },
      { text: "Vazgeçtim" },
      { text: "Yanlış kartla ödeme yaptım" },
      { text: "Fiyat nedeniyle vazgeçtim" },
      { text: "Adreste bulunamayacağım" },
    ],
  },
  {
    q: "Ne zaman iptal talebi oluşturabilirim?",
    a: "Siparişinizi verdikten sonra, ürününüz henüz kargoya teslim edilmeden veya kargo sürecindeyken dilediğiniz an iptal talebi oluşturabilirsiniz. Ürününüz kargoya verilmeden yapılan iptallerde süreç çok daha hızlı ilerler.",
  },
  {
    q: "İptal talebi nasıl oluşturulur?",
    a: "Tarodan uygulamasını açarak Hesabım → Siparişlerim adımlarını izleyebilirsiniz. İptal etmek istediğiniz siparişin detayına girdikten sonra ilgili iptal nedenini seçerek talebinizi anında sisteme iletebilirsiniz.",
  },
  {
    q: "İptal talebi nasıl değerlendirilir?",
    a: "Oluşturduğunuz iptal talebi, ürünün o anki lojistik durumuna (kargoya verilip verilmediğine) ve seçtiğiniz iptal nedenine göre sistem tarafından otomatik olarak veya Tarodan operasyon ekibimiz tarafından titizlikle incelenerek değerlendirilir.",
  },
  {
    q: "İptal talebi ne kadar sürede sonuçlanır?",
    a: "İptal talebiniz sisteme ulaştığı andan itibaren hızla işleme alınır. Ürün henüz kargoya verilmediyse talepleriniz anında veya en kısa sürede sonuçlandırılır; kargodaki ürünler için ise deponun veya kargo firmasının iade süreçlerine bağlı olarak süre değişiklik gösterebilir.",
  },
  {
    q: "İptal talebi kabul edilen alıcı ne yapmalıdır?",
    a: "Eğer iptal edilen ürün kargoya verilmişse ve elinize ulaşırsa, paketi açmadan size iletilen iade kargo koduyla birlikte anlaşmalı kargo şubesine teslim etmeniz gerekir. Ürün kargoya verilmeden iptal edildiyse alıcının ekstra bir işlem yapmasına gerek yoktur.",
  },
  {
    q: "İptal gönderimi için ödeme yapmam gerekiyor mu?",
    a: "İptal nedeninize ve ürünün durumuna göre kargo masrafı değişiklik gösterir:",
    bullets: [
      {
        label: "Teslimat tarihi gecikti",
        text: "Kargo ücretini satıcı öder.",
      },
      {
        label:
          "Yanlış ürün seçtim, vazgeçtim, yanlış kartla ödeme yaptım, fiyat nedeniyle vazgeçtim, adreste bulunamayacağım",
        text: "Ürün kargoya verildiyse kargo ücretini alıcı öder; kargoya verilmediyse kargo gönderimi söz konusu değildir.",
      },
    ],
  },
  {
    q: "İptal edilen siparişin ücret iadesi ne zaman yapılır?",
    a: "İptal işleminiz onaylandığında veya kargodaki ürün merkeze ulaştığında, ödemeniz Tarodan’ın güvenli havuzundan çözülerek bankanıza iade talimatı verilir. Ücretin hesabınıza yansıma süresi bankanızın süreçlerine bağlı olarak genellikle 1 ila 3 iş günü sürmektedir.",
  },
  {
    q: "İptal edilen üründe tutar neden daha düşük?",
    a: "İptal edilen siparişlerde tutarın bir kısmının kesilmesinin nedeni, seçtiğiniz iptal nedenine ve ürünün o anki durumuna dayanır:",
    bullets: [
      {
        label: "Teslimat tarihi gecikti",
        text: "Bu durumda tüm masraflar satıcıya aittir.",
      },
      {
        label:
          "Yanlış ürün seçtim, vazgeçtim, yanlış kartla ödeme yaptım, fiyat nedeniyle vazgeçtim, adreste bulunamayacağım",
        text: "Ürün kargoya verildiyse kargo ücreti alıcıdan düşülür; kargoya verilmediyse işlemden yalnızca “Alıcı Koruma Hizmet Bedeli” kesilir ve kalan tutar hesabınıza yansıtılır.",
      },
    ],
  },
];

import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sıkça Sorulan Sorular | Tarodan',
  description:
    'Tarodan hakkında sıkça sorulan sorular: üyelik, satın alma, satış, komisyon, takas, kargo ve hesap işlemleri.',
};

// İçerik mobil Yardım ekranındaki SSS ile aynı kaynaktan tutulur (apps/mobile/app/help.tsx).
// Anchor id'leri Yardım Merkezi (apps/web/src/app/help/page.tsx) linkleriyle eşleşir:
// #general #buying #selling #trade #account #shipping
const FAQ_SECTIONS: Array<{
  id: string;
  title: string;
  questions: Array<{ q: string; a: string }>;
}> = [
  {
    id: 'general',
    title: 'Genel',
    questions: [
      {
        q: 'Tarodan nedir?',
        a: 'Tarodan, koleksiyonerlerin diecast model arabalarını alıp satabildiği, takas yapabildiği ve koleksiyonlarını sergileyebildiği bir pazar yeridir.',
      },
      {
        q: 'Nasıl üye olabilirim?',
        a: 'Ana sayfadaki "Üye Ol" butonuna tıklayarak e-posta, telefon ve kişisel bilgilerinizi girerek ücretsiz üyelik oluşturabilirsiniz. Üyeliğinizi doğrulamak için e-posta ve SMS doğrulaması gereklidir.',
      },
      {
        q: 'Premium üyelik ne sağlar?',
        a: 'Premium üyeler sınırsız ilan yayınlayabilir, takas yapabilir, koleksiyon (Digital Garage) oluşturabilir, öne çıkan ilanlar kullanabilir ve öncelikli destek alabilir.',
      },
    ],
  },
  {
    id: 'buying',
    title: 'Satın Alma',
    questions: [
      {
        q: 'Üye olmadan alışveriş yapabilir miyim?',
        a: 'Evet! Misafir olarak alışveriş yapabilirsiniz. Siparişiniz e-posta ile takip edilebilir. Ancak favorilere ekleme ve satıcıyla mesajlaşma için üyelik gereklidir.',
      },
      {
        q: 'Ödeme yöntemleri nelerdir?',
        a: 'Kredi kartı ve banka kartı ile ödeme yapabilirsiniz. Tüm ödemeler güvenli olarak işlenir ve ürün elinize ulaşana kadar koruma altındadır.',
      },
      {
        q: 'Siparişimi nasıl takip ederim?',
        a: 'Sipariş onay e-postasındaki link ile veya siparişlerim sayfasından siparişinizi takip edebilirsiniz.',
      },
      {
        q: 'İade politikası nedir?',
        a: 'Ürün açıklamasına uymuyorsa teslim tarihinden itibaren 14 gün içinde iade talep edebilirsiniz. Detaylar için satıcının iade politikasını kontrol edin.',
      },
    ],
  },
  {
    id: 'selling',
    title: 'Satış',
    questions: [
      {
        q: 'Nasıl ilan veririm?',
        a: 'Üye girişi yaptıktan sonra "İlan Ver" butonuna tıklayarak ürün bilgilerini, fotoğraflarını ve fiyatını girerek ilan oluşturabilirsiniz.',
      },
      {
        q: 'İlan ücreti var mı?',
        a: 'Ücretsiz üyeler belirli sayıda ücretsiz ilan verebilir. Premium üyeler sınırsız ilan yayınlayabilir.',
      },
      {
        q: 'Komisyon oranı nedir?',
        a: "Satış tutarı üzerinden %5'ten başlayan platform komisyonu kesilir. Komisyon oranı ürün kategorisine göre değişebilir ve Premium/Business üyelikte düşer. Net oran satış sırasında gösterilir.",
      },
      {
        q: 'Ödememi ne zaman alırım?',
        a: 'Alıcı ürünü teslim aldığını onayladıktan 3 iş günü içinde ödemeniz hesabınıza aktarılır.',
      },
    ],
  },
  {
    id: 'trade',
    title: 'Takas',
    questions: [
      {
        q: 'Takas nasıl çalışır?',
        a: 'Premium üyeler "Takas Açık" olarak işaretlenmiş ürünlere takas teklifi gönderebilir. Karşılıklı onay ile takas gerçekleşir.',
      },
      {
        q: 'Takas güvenli mi?',
        a: 'Evet, takas işlemleri platform garantisi altındadır. Her iki taraf da ürünleri göndermeden önce takas onaylanır.',
      },
      {
        q: 'Fark ödemeli takas yapabilir miyim?',
        a: 'Evet, takas teklifinde nakit fark ekleyebilirsiniz. Fark ödemesi güvenli ödeme sistemi üzerinden yapılır.',
      },
    ],
  },
  {
    id: 'shipping',
    title: 'Kargo ve Teslimat',
    questions: [
      {
        q: 'Kargomu nasıl takip ederim?',
        a: 'Satıcı kargo takip numarasını girdikten sonra siparişlerim sayfasından ve e-posta bildirimlerinden gönderinizi takip edebilirsiniz.',
      },
      {
        q: 'Teslimat ne kadar sürer?',
        a: 'Teslimat süresi satıcının kargoya verme süresine ve kargo firmasına bağlıdır; genellikle 1-5 iş günü içinde teslim edilir.',
      },
      {
        q: 'Ürün hasarlı geldi, ne yapmalıyım?',
        a: 'Ürün hasarlı veya açıklamaya uygun değilse teslim aldıktan sonra 3 gün içinde fotoğraflarla birlikte iade/anlaşmazlık talebi oluşturun. Süreç platform koruması altındadır.',
      },
    ],
  },
  {
    id: 'account',
    title: 'Hesap',
    questions: [
      {
        q: 'Şifremi unuttum, ne yapmalıyım?',
        a: 'Giriş sayfasındaki "Şifremi Unuttum" linkine tıklayarak e-posta adresinize şifre sıfırlama bağlantısı gönderilmesini sağlayabilirsiniz.',
      },
      {
        q: 'Hesabımı nasıl silerim?',
        a: 'Profil > Ayarlar > Hesap > Hesabı Sil seçeneğinden hesabınızı kalıcı olarak silebilirsiniz. Bu işlem geri alınamaz.',
      },
      {
        q: 'Premium üyeliği nasıl iptal ederim?',
        a: 'Profil > Ayarlar > Üyelik > Aboneliği İptal Et seçeneğinden iptal edebilirsiniz. Mevcut dönem sonuna kadar premium özellikleri kullanmaya devam edersiniz.',
      },
    ],
  },
];

export default function FAQPage() {
  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <nav className="mb-8 text-sm text-muted">
          <Link href="/" className="hover:text-primary-600">Ana Sayfa</Link>
          <span className="mx-2">/</span>
          <span className="text-heading">Sıkça Sorulan Sorular</span>
        </nav>

        <article className="bg-surface-elevated rounded-xl shadow-sm overflow-hidden">
          <header className="border-b border-border-subtle px-6 py-8">
            <h1 className="text-3xl font-bold text-heading">Sıkça Sorulan Sorular</h1>
            <p className="text-muted mt-2">
              Aradığınızı bulamadıysanız{' '}
              <Link href="/contact" className="text-primary-600 hover:underline">iletişim formundan</Link>{' '}
              bize yazabilirsiniz.
            </p>
          </header>

          {/* Bölüm içi hızlı gezinme */}
          <nav className="flex flex-wrap gap-2 px-6 py-4 border-b border-border-subtle">
            {FAQ_SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="text-xs font-medium px-3 py-1.5 rounded-full bg-surface text-muted hover:bg-primary-50 hover:text-primary-600 transition-colors"
              >
                {s.title}
              </a>
            ))}
          </nav>

          <div className="px-6 py-8 space-y-10">
            {FAQ_SECTIONS.map((section) => (
              <section key={section.id} id={section.id} className="scroll-mt-24">
                <h2 className="text-xl font-bold text-heading mb-4">{section.title}</h2>
                <div className="space-y-4">
                  {section.questions.map((item, i) => (
                    <div key={i} className="border border-border-subtle rounded-lg p-4">
                      <h3 className="font-semibold text-heading">{item.q}</h3>
                      <p className="text-muted text-sm mt-1.5 leading-relaxed">{item.a}</p>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </article>
      </div>
    </div>
  );
}

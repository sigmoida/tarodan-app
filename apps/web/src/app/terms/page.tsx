'use client';

import Link from 'next/link';
import { useTranslation } from '@/i18n/LanguageContext';

export default function TermsPage() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 text-white py-12">
        <div className="max-w-4xl mx-auto px-4">
          <h1 className="text-3xl font-bold mb-2">{t('legal.termsTitle')}</h1>
          <p className="text-gray-400">{t('legal.lastUpdated')}: 24 Ocak 2026</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl shadow-sm p-8 prose prose-gray max-w-none">
          <h2>1. Giriş</h2>
          <p>
            TARODAN platformuna hoş geldiniz. Bu Kullanım Şartları ("Şartlar"), 
            TARODAN web sitesi ve mobil uygulamalarını ("Platform") kullanımınızı düzenler. 
            Platformu kullanarak bu şartları kabul etmiş olursunuz.
          </p>

          <h2>2. Tanımlar</h2>
          <ul>
            <li><strong>"Platform":</strong> TARODAN web sitesi ve tüm ilgili hizmetler</li>
            <li><strong>"Kullanıcı":</strong> Platformda kayıtlı olan tüm bireysel ve kurumsal üyeler</li>
            <li><strong>"Satıcı":</strong> Platformda ürün satan kullanıcılar</li>
            <li><strong>"Alıcı":</strong> Platformdan ürün satın alan kullanıcılar</li>
            <li><strong>"İçerik":</strong> Platformda paylaşılan tüm metin, görsel ve diğer materyaller</li>
          </ul>

          <h2>3. Üyelik</h2>
          <h3>3.1 Üyelik Koşulları</h3>
          <p>
            Platformumuza üye olmak için 18 yaşını doldurmuş olmanız gerekmektedir. 
            18 yaş altı kullanıcılar veli/vasi onayı ile platformu kullanabilir.
          </p>

          <h3>3.2 Hesap Güvenliği</h3>
          <p>
            Hesabınızın güvenliğinden siz sorumlusunuz. Şifrenizi kimseyle paylaşmayın 
            ve şüpheli bir aktivite fark ettiğinizde derhal bize bildirin.
          </p>

          <h2>4. Platformun Kullanımı</h2>
          <h3>4.1 İzin Verilen Kullanım</h3>
          <ul>
            <li>Diecast model araba alım, satım ve takas işlemleri</li>
            <li>Koleksiyon oluşturma ve paylaşma</li>
            <li>Diğer kullanıcılarla iletişim kurma</li>
            <li>Platform özelliklerini meşru amaçlarla kullanma</li>
          </ul>

          <h3>4.2 Yasak Davranışlar</h3>
          <ul>
            <li>Sahte, yanıltıcı veya hileli içerik paylaşmak</li>
            <li>Telif hakkı ihlali içeren materyaller paylaşmak</li>
            <li>Spam, reklam veya istenmeyen içerik göndermek</li>
            <li>Platformun güvenliğini tehlikeye atacak eylemler</li>
            <li>Diğer kullanıcılara hakaret, tehdit veya taciz</li>
            <li>Sahte hesap oluşturmak veya kullanmak</li>
            <li>Yasadışı ürün satışı veya tanıtımı</li>
          </ul>

          <h2>5. Satış ve Alışveriş</h2>
          <h3>5.1 Satıcı Yükümlülükleri</h3>
          <ul>
            <li>Ürünleri doğru ve eksiksiz tanımlamak</li>
            <li>Gerçek ve net fotoğraflar kullanmak</li>
            <li>Satış sonrası ürünü belirtilen sürede göndermek</li>
            <li>Platform komisyonlarını kabul etmek</li>
          </ul>

          <h3>5.2 Alıcı Yükümlülükleri</h3>
          <ul>
            <li>Ödemeyi zamanında yapmak</li>
            <li>Teslimat adresini doğru vermek</li>
            <li>Ürünü teslim aldıktan sonra kontrol etmek</li>
            <li>Sorunları 24 saat içinde bildirmek</li>
          </ul>

          <h3>5.3 Komisyonlar</h3>
          <p>
            Platform, her başarılı satıştan komisyon alır:
          </p>
          <ul>
            <li>Ücretsiz üyelik: %8</li>
            <li>Premium üyelik: %6</li>
            <li>Business üyelik: %4</li>
          </ul>

          <h2>6. Takas İşlemleri</h2>
          <p>
            Takas işlemlerinde platform komisyon almaz. Taraflar kargo masraflarından sorumludur. 
            Anlaşmazlık durumunda platform arabuluculuk yapabilir ancak sorumluluk taraflara aittir.
          </p>

          <h2>7. İade ve İptal</h2>
          <h3>7.1 Cayma Hakkı</h3>
          <p>
            Tüketiciler, 6502 sayılı Kanun uyarınca 14 gün içinde cayma hakkına sahiptir. 
            Cayma hakkı kullanımında ürün kullanılmamış ve orijinal ambalajında olmalıdır.
          </p>

          <h3>7.2 İade Koşulları</h3>
          <ul>
            <li>Ürün açıklamasıyla uyuşmazlık</li>
            <li>Hasarlı veya kusurlu ürün</li>
            <li>Yanlış ürün gönderimi</li>
          </ul>

          <h2>8. Fikri Mülkiyet</h2>
          <p>
            Platform üzerindeki tüm içerik, tasarım ve yazılım TARODAN'a aittir. 
            Kullanıcılar kendi içeriklerinin telif hakkına sahiptir ancak platformda 
            yayınlama hakkını TARODAN'a lisanslar.
          </p>

          <h2>9. Sorumluluk Sınırı</h2>
          <p>
            TARODAN, kullanıcılar arasındaki işlemlerde aracı konumundadır. 
            Ürün kalitesi, teslimat sorunları ve anlaşmazlıklarda nihai sorumluluk 
            ilgili taraflara aittir. Platform, yasaların izin verdiği ölçüde 
            sorumluluğunu sınırlandırır.
          </p>

          <h2>10. Hesap Askıya Alma ve Fesih</h2>
          <p>
            TARODAN, bu şartları ihlal eden hesapları önceden bildirimde bulunmaksızın 
            askıya alabilir veya kapatabilir. Kullanıcılar da istedikleri zaman 
            hesaplarını kapatabilir.
          </p>

          <h2>11. Değişiklikler</h2>
          <p>
            Bu şartlar zaman zaman güncellenebilir. Önemli değişiklikler e-posta 
            ile bildirilir. Güncellemelerden sonra platformu kullanmaya devam etmeniz 
            yeni şartları kabul ettiğiniz anlamına gelir.
          </p>

          <h2>12. Uygulanacak Hukuk</h2>
          <p>
            Bu şartlar Türkiye Cumhuriyeti yasalarına tabidir. Uyuşmazlıklarda 
            İstanbul Mahkemeleri ve İcra Daireleri yetkilidir.
          </p>

          <h2>13. İletişim</h2>
          <p>
            Bu şartlarla ilgili sorularınız için:
          </p>
          <ul>
            <li>E-posta: hukuk@tarodan.com</li>
            <li>Adres: [Şirket Adresi]</li>
          </ul>

          <div className="mt-8 p-4 bg-gray-100 rounded-lg">
            <p className="text-sm text-gray-600">
              Bu kullanım şartlarını okuduğunuzu ve kabul ettiğinizi onaylıyorsunuz.
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-4">
          <Link href="/privacy" className="text-primary-500 hover:underline">
            Gizlilik Politikası →
          </Link>
          <Link href="/cookies" className="text-primary-500 hover:underline">
            Çerez Politikası →
          </Link>
          <Link href="/distance-sales" className="text-primary-500 hover:underline">
            Mesafeli Satış Sözleşmesi →
          </Link>
        </div>
      </div>
    </div>
  );
}

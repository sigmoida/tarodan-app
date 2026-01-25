'use client';

import Link from 'next/link';
import { useTranslation } from '@/i18n/LanguageContext';

export default function PrivacyPage() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 text-white py-12">
        <div className="max-w-4xl mx-auto px-4">
          <h1 className="text-3xl font-bold mb-2">{t('legal.privacyTitle')}</h1>
          <p className="text-gray-400">{t('legal.lastUpdated')}: 24 Ocak 2026</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl shadow-sm p-8 prose prose-gray max-w-none">
          <h2>1. Giriş</h2>
          <p>
            TARODAN olarak kişisel verilerinizin korunmasına büyük önem veriyoruz. 
            Bu Gizlilik Politikası, kişisel verilerinizin nasıl toplandığını, 
            kullanıldığını ve korunduğunu açıklamaktadır.
          </p>
          <p>
            6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) ve Avrupa Birliği 
            Genel Veri Koruma Tüzüğü (GDPR) kapsamında haklarınızı ve uygulamalarımızı 
            bu politikada bulabilirsiniz.
          </p>

          <h2>2. Veri Sorumlusu</h2>
          <p>
            <strong>Şirket Adı:</strong> TARODAN Teknoloji A.Ş.<br />
            <strong>Adres:</strong> [Şirket Adresi]<br />
            <strong>E-posta:</strong> kvkk@tarodan.com<br />
            <strong>Telefon:</strong> 0850 XXX XX XX
          </p>

          <h2>3. Toplanan Veriler</h2>
          <h3>3.1 Doğrudan Sağladığınız Veriler</h3>
          <ul>
            <li><strong>Kimlik Bilgileri:</strong> Ad, soyad, doğum tarihi</li>
            <li><strong>İletişim Bilgileri:</strong> E-posta adresi, telefon numarası, adres</li>
            <li><strong>Hesap Bilgileri:</strong> Kullanıcı adı, şifre (şifrelenmiş)</li>
            <li><strong>Ödeme Bilgileri:</strong> Kart bilgileri (ödeme sağlayıcı tarafından işlenir)</li>
            <li><strong>Profil Bilgileri:</strong> Profil fotoğrafı, biyografi</li>
          </ul>

          <h3>3.2 Otomatik Toplanan Veriler</h3>
          <ul>
            <li><strong>Cihaz Bilgileri:</strong> IP adresi, tarayıcı türü, işletim sistemi</li>
            <li><strong>Kullanım Verileri:</strong> Ziyaret edilen sayfalar, tıklamalar, arama geçmişi</li>
            <li><strong>Konum Verileri:</strong> Genel konum (şehir düzeyinde)</li>
            <li><strong>Çerez Verileri:</strong> Tercihler, oturum bilgileri</li>
          </ul>

          <h2>4. Verilerin Kullanım Amaçları</h2>
          <ul>
            <li>Hesap oluşturma ve yönetimi</li>
            <li>Alışveriş ve satış işlemlerinin gerçekleştirilmesi</li>
            <li>Ödeme işlemlerinin güvenli şekilde yapılması</li>
            <li>Kargo ve teslimat süreçlerinin yönetimi</li>
            <li>Müşteri desteği sağlanması</li>
            <li>Platform güvenliğinin sağlanması</li>
            <li>Dolandırıcılık önleme</li>
            <li>Yasal yükümlülüklerin yerine getirilmesi</li>
            <li>Hizmet iyileştirme ve analiz</li>
            <li>İzninize bağlı olarak pazarlama iletişimleri</li>
          </ul>

          <h2>5. Verilerin Paylaşımı</h2>
          <h3>5.1 Verilerinizi Paylaştığımız Taraflar</h3>
          <ul>
            <li><strong>Ödeme Sağlayıcıları:</strong> Iyzico, ödeme işlemleri için</li>
            <li><strong>Kargo Şirketleri:</strong> Aras Kargo, teslimat için</li>
            <li><strong>Bulut Hizmeti Sağlayıcıları:</strong> Veri depolama için</li>
            <li><strong>Analitik Hizmetler:</strong> Platform analizi için</li>
            <li><strong>Yasal Makamlar:</strong> Yasal zorunluluk halinde</li>
          </ul>

          <h3>5.2 Veri Aktarımı</h3>
          <p>
            Verileriniz Türkiye sınırları içinde işlenir. Yurt dışına veri aktarımı 
            gerektiğinde KVKK ve GDPR standartlarına uygun önlemler alınır.
          </p>

          <h2>6. Veri Güvenliği</h2>
          <p>Verilerinizi korumak için aldığımız önlemler:</p>
          <ul>
            <li>SSL/TLS şifreleme</li>
            <li>Şifrelerin hash algoritmasıyla saklanması</li>
            <li>Düzenli güvenlik denetimleri</li>
            <li>Erişim kontrolü ve yetkilendirme</li>
            <li>Güvenlik duvarları ve saldırı tespit sistemleri</li>
            <li>Çalışan eğitimleri</li>
          </ul>

          <h2>7. Veri Saklama Süreleri</h2>
          <table className="w-full border-collapse border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 p-2 text-left">Veri Türü</th>
                <th className="border border-gray-300 p-2 text-left">Saklama Süresi</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-300 p-2">Hesap Bilgileri</td>
                <td className="border border-gray-300 p-2">Hesap silinene kadar</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2">İşlem Kayıtları</td>
                <td className="border border-gray-300 p-2">10 yıl (yasal zorunluluk)</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2">Kullanım Logları</td>
                <td className="border border-gray-300 p-2">2 yıl</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2">Pazarlama Verileri</td>
                <td className="border border-gray-300 p-2">İzin geri çekilene kadar</td>
              </tr>
            </tbody>
          </table>

          <h2>8. Haklarınız (KVKK Madde 11)</h2>
          <p>KVKK kapsamında aşağıdaki haklara sahipsiniz:</p>
          <ul>
            <li>Kişisel verilerinizin işlenip işlenmediğini öğrenme</li>
            <li>Kişisel verileriniz işlenmişse buna ilişkin bilgi talep etme</li>
            <li>Kişisel verilerinizin işlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme</li>
            <li>Yurt içinde veya yurt dışında kişisel verilerinizin aktarıldığı üçüncü kişileri bilme</li>
            <li>Kişisel verilerinizin eksik veya yanlış işlenmiş olması hâlinde bunların düzeltilmesini isteme</li>
            <li>Kişisel verilerinizin silinmesini veya yok edilmesini isteme</li>
            <li>Kişisel verilerinizin düzeltilmesi, silinmesi veya yok edilmesi halinde bu işlemlerin ilgili üçüncü kişilere bildirilmesini isteme</li>
            <li>İşlenen verilerinizin münhasıran otomatik sistemler vasıtasıyla analiz edilmesi suretiyle aleyhinize bir sonucun ortaya çıkmasına itiraz etme</li>
            <li>Kişisel verilerinizin kanuna aykırı olarak işlenmesi sebebiyle zarara uğramanız hâlinde zararın giderilmesini talep etme</li>
          </ul>

          <h2>9. Başvuru Yöntemi</h2>
          <p>
            Haklarınızı kullanmak için aşağıdaki yöntemlerle bize başvurabilirsiniz:
          </p>
          <ul>
            <li><strong>E-posta:</strong> kvkk@tarodan.com (konu satırına "KVKK Başvurusu" yazın)</li>
            <li><strong>Posta:</strong> [Şirket Adresi] - KVKK Birimi</li>
            <li><strong>Platform İçi:</strong> Profil Ayarları → Gizlilik → Veri Talebi</li>
          </ul>
          <p>
            Başvurularınız en geç 30 gün içinde ücretsiz olarak yanıtlanacaktır. 
            İşlemin ayrıca bir maliyet gerektirmesi halinde Kurul tarafından belirlenen 
            tarife uygulanabilir.
          </p>

          <h2>10. Çerezler</h2>
          <p>
            Platform üzerinde çerezler kullanılmaktadır. Çerez kullanımı hakkında 
            detaylı bilgi için <Link href="/cookies" className="text-primary-500 hover:underline">Çerez Politikamızı</Link> inceleyiniz.
          </p>

          <h2>11. Çocukların Gizliliği</h2>
          <p>
            Platformumuz 18 yaş altı kullanıcılara yönelik değildir. 18 yaş altı 
            bireylerin kişisel verilerini bilerek toplamıyoruz. Böyle bir durumun 
            farkına varırsak, ilgili verileri derhal sileriz.
          </p>

          <h2>12. Politika Güncellemeleri</h2>
          <p>
            Bu politika gerektiğinde güncellenebilir. Önemli değişiklikler e-posta 
            ile bildirilir. Güncellemeler yayınlandıkları tarihte yürürlüğe girer.
          </p>

          <h2>13. İletişim</h2>
          <p>
            Gizlilik politikamız hakkında sorularınız için:
          </p>
          <ul>
            <li><strong>E-posta:</strong> kvkk@tarodan.com</li>
            <li><strong>Telefon:</strong> 0850 XXX XX XX</li>
            <li><strong>Adres:</strong> [Şirket Adresi]</li>
          </ul>

          <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-800">
              <strong>Veri Koruma Görevlisi:</strong><br />
              Kişisel verilerinizle ilgili tüm sorularınız için Veri Koruma Görevlimize 
              dpo@tarodan.com adresinden ulaşabilirsiniz.
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-4">
          <Link href="/terms" className="text-primary-500 hover:underline">
            Kullanım Şartları →
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

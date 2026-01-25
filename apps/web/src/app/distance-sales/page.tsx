'use client';

import Link from 'next/link';
import { useTranslation } from '@/i18n/LanguageContext';

export default function DistanceSalesPage() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 text-white py-12">
        <div className="max-w-4xl mx-auto px-4">
          <h1 className="text-3xl font-bold mb-2">{t('legal.distanceSalesTitle')}</h1>
          <p className="text-gray-400">{t('legal.lastUpdated')}: 24 Ocak 2026</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl shadow-sm p-8 prose prose-gray max-w-none">
          <h2>MADDE 1 - TARAFLAR</h2>
          
          <h3>1.1 SATICI</h3>
          <table className="w-full border-collapse">
            <tbody>
              <tr>
                <td className="border p-2 font-semibold w-1/3">Unvan</td>
                <td className="border p-2">TARODAN Teknoloji A.Ş.</td>
              </tr>
              <tr>
                <td className="border p-2 font-semibold">Adres</td>
                <td className="border p-2">[Şirket Adresi]</td>
              </tr>
              <tr>
                <td className="border p-2 font-semibold">Telefon</td>
                <td className="border p-2">0850 XXX XX XX</td>
              </tr>
              <tr>
                <td className="border p-2 font-semibold">E-posta</td>
                <td className="border p-2">info@tarodan.com</td>
              </tr>
              <tr>
                <td className="border p-2 font-semibold">Mersis No</td>
                <td className="border p-2">[Mersis Numarası]</td>
              </tr>
            </tbody>
          </table>

          <h3>1.2 ALICI</h3>
          <p>
            İşbu sözleşmeyi onaylayan ve TARODAN platformu üzerinden alışveriş yapan 
            gerçek veya tüzel kişi ("Alıcı").
          </p>
          <p className="text-sm text-gray-500">
            Not: Alıcı bilgileri, sipariş onayı sırasında girilen bilgilerden oluşur.
          </p>

          <h2>MADDE 2 - KONU</h2>
          <p>
            İşbu Sözleşme'nin konusu, ALICI'nın SATICI'ya ait www.tarodan.com 
            internet sitesinden elektronik ortamda siparişini verdiği aşağıda nitelikleri 
            ve satış fiyatı belirtilen ürünün satışı ve teslimi ile ilgili olarak 
            6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler 
            Yönetmeliği hükümleri gereğince tarafların hak ve yükümlülüklerini kapsar.
          </p>

          <h2>MADDE 3 - SÖZLEŞME KONUSU ÜRÜN</h2>
          <p>
            Malın/Ürünün/Hizmetin türü ve miktarı, marka/modeli, rengi, adedi ve 
            satış bedeli sipariş sayfasında yer aldığı gibidir.
          </p>

          <h3>3.1 Ürün Özellikleri</h3>
          <ul>
            <li>Ürün tipi: Diecast Model Araba ve Koleksiyon Ürünleri</li>
            <li>Ürün detayları sipariş özeti ve faturada belirtilir</li>
            <li>Listelenen fiyatlara KDV dahildir</li>
          </ul>

          <h3>3.2 Ödeme Şekli</h3>
          <ul>
            <li>Kredi Kartı / Banka Kartı</li>
            <li>Sanal Kart</li>
            <li>Ödeme işlemleri Iyzico altyapısı ile güvenli şekilde gerçekleştirilir</li>
          </ul>

          <h3>3.3 Teslimat</h3>
          <ul>
            <li>Teslimat adresi: Sipariş sırasında belirtilen adres</li>
            <li>Teslim edilecek kişi: Sipariş sırasında belirtilen alıcı</li>
            <li>Tahmini teslimat süresi: 3-7 iş günü</li>
            <li>Kargo firması: Aras Kargo</li>
          </ul>

          <h2>MADDE 4 - GENEL HÜKÜMLER</h2>
          <p>
            4.1. ALICI, SATICI'ya ait internet sitesinde sözleşme konusu ürünün temel 
            nitelikleri, satış fiyatı ve ödeme şekli ile teslimata ilişkin ön bilgileri 
            okuyup, bilgi sahibi olduğunu, elektronik ortamda gerekli teyidi verdiğini 
            kabul, beyan ve taahhüt eder.
          </p>
          <p>
            4.2. ALICI'nın; Ön Bilgilendirme Formunu elektronik ortamda teyit etmesi, 
            mesafeli satış sözleşmesinin kurulmasından evvel, SATICI tarafından ALICI'ya 
            verilmesi gereken adresi, siparişi verilen ürünlere ait temel özellikleri, 
            ürünlerin vergiler dâhil fiyatını, ödeme ve teslimat bilgilerini de doğru ve 
            eksiksiz olarak edindiğini kabul, beyan ve taahhüt eder.
          </p>
          <p>
            4.3. Sözleşme konusu her bir ürün, 30 günlük yasal süreyi aşmamak kaydı ile 
            ALICI'nın yerleşim yeri uzaklığına bağlı olarak internet sitesindeki ön 
            bilgiler kısmında belirtilen süre zarfında ALICI veya ALICI'nın gösterdiği 
            adresteki kişi ve/veya kuruluşa teslim edilir.
          </p>
          <p>
            4.4. SATICI, Sözleşme konusu ürünü eksiksiz, siparişte belirtilen niteliklere 
            uygun ve varsa garanti belgeleri, kullanım kılavuzları ile birlikte teslim 
            etmeyi, her türlü ayıptan arî olarak yasal mevzuat gereklerine göre sağlam, 
            standartlara uygun bir şekilde işin gereği olan bilgi ve belgeler ile işi 
            doğruluk ve dürüstlük esasları dâhilinde ifa etmeyi, hizmet kalitesini koruyup 
            yükseltmeyi, işin ifası sırasında gerekli dikkat ve özeni göstermeyi, 
            ihtiyat ve öngörü ile hareket etmeyi kabul, beyan ve taahhüt eder.
          </p>
          <p>
            4.5. SATICI, sözleşmeden doğan ifa yükümlülüğünün süresi dolmadan ALICI'yı 
            bilgilendirmek ve açıkça onayını almak suretiyle eşit kalite ve fiyatta 
            farklı bir ürün tedarik edebilir.
          </p>
          <p>
            4.6. SATICI, sipariş konusu ürün veya hizmetin yerine getirilmesinin 
            imkânsızlaşması halinde sözleşme konusu yükümlülüklerini yerine 
            getiremezse, bu durumu, öğrendiği tarihten itibaren 3 gün içinde yazılı 
            olarak tüketiciye bildireceğini, 14 günlük süre içinde toplam bedeli 
            ALICI'ya iade edeceğini kabul, beyan ve taahhüt eder.
          </p>
          <p>
            4.7. ALICI, Sözleşme konusu ürünün teslimatı için işbu Sözleşme'yi 
            elektronik ortamda teyit edeceğini, herhangi bir nedenle sözleşme konusu 
            ürün bedelinin ödenmemesi ve/veya banka kayıtlarında iptal edilmesi halinde, 
            SATICI'nın sözleşme konusu ürünü teslim yükümlülüğünün sona ereceğini kabul, 
            beyan ve taahhüt eder.
          </p>

          <h2>MADDE 5 - CAYMA HAKKI</h2>
          <p>
            5.1. ALICI; mal satışına ilişkin mesafeli sözleşmelerde, ürünün kendisine 
            veya gösterdiği adresteki kişi/kuruluşa teslim tarihinden itibaren 14 
            (on dört) gün içerisinde, SATICI'ya bildirmek şartıyla, hiçbir hukuki ve 
            cezai sorumluluk üstlenmeksizin ve hiçbir gerekçe göstermeksizin malı 
            reddederek sözleşmeden cayma hakkını kullanabilir.
          </p>
          <p>
            5.2. ALICI, cayma hakkını kullanmak istediğini SATICI'ya aşağıdaki 
            yöntemlerden biriyle bildirebilir:
          </p>
          <ul>
            <li>E-posta: iade@tarodan.com</li>
            <li>Platform içi iade talebi formu</li>
            <li>Posta: [Şirket Adresi]</li>
          </ul>
          <p>
            5.3. Cayma hakkının kullanılması halinde:
          </p>
          <ul>
            <li>ALICI'ya veya ALICI'nın belirlediği üçüncü kişiye teslim edilen ürünün 
                faturası (İade edilecek ürünün faturası kurumsal ise, iade faturası kesilmesi 
                gerekmektedir)</li>
            <li>İade formu</li>
            <li>İade edilecek ürünlerin kutusu, ambalajı, varsa standart aksesuarları 
                ile birlikte eksiksiz ve hasarsız olarak teslim edilmesi gerekmektedir</li>
          </ul>
          <p>
            5.4. SATICI, cayma bildiriminin kendisine ulaşmasından itibaren en geç 14 
            gün içinde toplam bedeli ALICI'ya iade etmekle yükümlüdür. ALICI'nın kredi 
            kartı ile yaptığı alışverişlerde iade, ALICI kredi kartına yapılır.
          </p>
          <p>
            5.5. Cayma hakkının kullanılması nedeniyle SATICI tarafından düzenlenen 
            kampanya limit tutarının altına düşülmesi halinde kampanya kapsamında 
            faydalanılan indirim miktarı iptal edilir.
          </p>

          <h3>5.6 Cayma Hakkının Kullanılamayacağı Durumlar</h3>
          <p>ALICI, aşağıdaki sözleşmelerde cayma hakkını kullanamaz:</p>
          <ul>
            <li>Fiyatı finansal piyasalardaki dalgalanmalara bağlı olarak değişen 
                ve satıcının kontrolünde olmayan mal veya hizmetlere ilişkin sözleşmeler</li>
            <li>Tüketicinin istekleri veya kişisel ihtiyaçları doğrultusunda hazırlanan 
                mallara ilişkin sözleşmeler</li>
            <li>Çabuk bozulabilen veya son kullanma tarihi geçebilecek malların teslimine 
                ilişkin sözleşmeler</li>
            <li>Tesliminden sonra ambalaj, bant, mühür, paket gibi koruyucu unsurları 
                açılmış olan mallardan; iadesi sağlık ve hijyen açısından uygun olmayanların 
                teslimine ilişkin sözleşmeler</li>
            <li>Tesliminden sonra başka ürünlerle karışan ve doğası gereği ayrıştırılması 
                mümkün olmayan mallara ilişkin sözleşmeler</li>
            <li>Malın tesliminden sonra ambalaj, bant, mühür, paket gibi koruyucu 
                unsurları açılmış olması halinde maddi ortamda sunulan kitap, dijital 
                içerik ve bilgisayar sarf malzemelerine ilişkin sözleşmeler</li>
            <li>Abonelik sözleşmesi kapsamında sağlananlar dışında, gazete ve dergi 
                gibi süreli yayınların teslimine ilişkin sözleşmeler</li>
            <li>Belirli bir tarihte veya dönemde yapılması gereken, konaklama, 
                eşya taşıma, araba kiralama, yiyecek-içecek tedariki ve eğlence veya 
                dinlenme amacıyla yapılan boş zamanın değerlendirilmesine ilişkin sözleşmeler</li>
            <li>Elektronik ortamda anında ifa edilen hizmetler veya tüketiciye anında 
                teslim edilen gayrimaddi mallara ilişkin sözleşmeler</li>
            <li>Cayma hakkı süresi sona ermeden önce, tüketicinin onayı ile ifasına 
                başlanan hizmetlere ilişkin sözleşmeler</li>
          </ul>

          <h2>MADDE 6 - GENEL HÜKÜMLER</h2>
          <p>
            6.1. ALICI, www.tarodan.com internet sitesinde sözleşme konusu ürünün temel 
            nitelikleri, satış fiyatı ve ödeme şekli ile teslimata ilişkin ön bilgileri 
            okuyup bilgi sahibi olduğunu ve elektronik ortamda gerekli teyidi verdiğini 
            beyan eder.
          </p>
          <p>
            6.2. Sözleşme konusu ürün, yasal 30 günlük süreyi aşmamak koşulu ile her bir 
            ürün için ALICI'nın yerleşim yerinin uzaklığına bağlı olarak ön bilgiler 
            içinde açıklanan süre içinde ALICI veya gösterdiği adresteki kişi/kuruluşa 
            teslim edilir.
          </p>

          <h2>MADDE 7 - UYUŞMAZLIK VE YETKİLİ MAHKEME</h2>
          <p>
            İşbu sözleşmenin uygulanmasında, Sanayi ve Ticaret Bakanlığınca ilan edilen 
            değere kadar Tüketici Hakem Heyetleri ile ALICI'nın veya SATICI'nın yerleşim 
            yerindeki Tüketici Mahkemeleri yetkilidir.
          </p>
          <p>
            Siparişin gerçekleşmesi durumunda ALICI işbu sözleşmenin tüm koşullarını 
            kabul etmiş sayılır.
          </p>

          <h2>MADDE 8 - YÜRÜRLÜK</h2>
          <p>
            8 (sekiz) maddeden ibaret bu sözleşme, taraflarca okunarak, [SİPARİŞ TARİHİ] 
            tarihinde, ALICI tarafından elektronik ortamda onaylanmak suretiyle akdedilmiş 
            ve yürürlüğe girmiştir.
          </p>

          <div className="mt-8 p-4 bg-gray-100 rounded-lg">
            <p className="text-sm text-gray-600">
              Bu sözleşme, sipariş onayı sırasında elektronik ortamda onaylandığında 
              yürürlüğe girer. Sözleşmenin bir kopyası sipariş onayı e-postası ile 
              gönderilir.
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-4">
          <Link href="/terms" className="text-primary-500 hover:underline">
            Kullanım Şartları →
          </Link>
          <Link href="/privacy" className="text-primary-500 hover:underline">
            Gizlilik Politikası →
          </Link>
          <Link href="/cookies" className="text-primary-500 hover:underline">
            Çerez Politikası →
          </Link>
        </div>
      </div>
    </div>
  );
}

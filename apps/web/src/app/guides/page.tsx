'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  UserPlusIcon,
  ShoppingBagIcon,
  CurrencyDollarIcon,
  ArrowsRightLeftIcon,
  CameraIcon,
  TruckIcon,
  StarIcon,
  ShieldCheckIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n/LanguageContext';

const GUIDES = [
  {
    id: 'getting-started',
    title: 'Başlangıç Rehberi',
    description: 'TARODAN\'a hoş geldiniz! Platformu kullanmaya başlamak için izlemeniz gereken adımlar.',
    icon: UserPlusIcon,
    color: 'text-blue-500',
    bgColor: 'bg-blue-50',
    steps: [
      {
        title: 'Üye Olun',
        content: 'E-posta adresiniz ve şifrenizle hızlıca üye olun. Google veya Facebook hesabınızla da giriş yapabilirsiniz.',
      },
      {
        title: 'Profilinizi Tamamlayın',
        content: 'Profil fotoğrafı ekleyin, bio yazın ve iletişim bilgilerinizi güncelleyin. Tam profiller daha güvenilir görünür.',
      },
      {
        title: 'Adres Ekleyin',
        content: 'Satın alma ve satış işlemleri için en az bir adres eklemeniz gerekiyor.',
      },
      {
        title: 'Keşfetmeye Başlayın',
        content: 'Kategorileri inceleyin, takip etmek istediğiniz satıcıları bulun ve favorilerinizi kaydedin.',
      },
    ],
  },
  {
    id: 'buying',
    title: 'Alışveriş Rehberi',
    description: 'TARODAN\'da güvenle alışveriş yapmanın tüm detayları.',
    icon: ShoppingBagIcon,
    color: 'text-green-500',
    bgColor: 'bg-green-50',
    steps: [
      {
        title: 'Ürün Arama',
        content: 'Arama çubuğunu kullanarak marka, model veya anahtar kelime ile arama yapın. Filtreler ile sonuçları daraltın.',
      },
      {
        title: 'Ürün Detaylarını İnceleyin',
        content: 'Fotoğrafları yakından inceleyin, açıklamayı okuyun, satıcı puanını kontrol edin. Sorularınız varsa mesaj gönderin.',
      },
      {
        title: 'Sepete Ekleyin',
        content: '"Sepete Ekle" butonuna tıklayın. Birden fazla ürünü aynı anda satın alabilirsiniz.',
      },
      {
        title: 'Ödeme Yapın',
        content: 'Adres seçin, kargo seçeneğini belirleyin ve güvenli ödeme sayfasında işleminizi tamamlayın.',
      },
      {
        title: 'Siparişi Takip Edin',
        content: '"Siparişlerim" sayfasından kargo durumunu gerçek zamanlı takip edin.',
      },
    ],
  },
  {
    id: 'selling',
    title: 'Satış Rehberi',
    description: 'Model arabalarınızı satışa sunmanın A\'dan Z\'ye tüm aşamaları.',
    icon: CurrencyDollarIcon,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-50',
    steps: [
      {
        title: 'İlan Ver Butonuna Tıklayın',
        content: 'Ana sayfada veya menüde "İlan Ver" butonuna tıklayarak ilan oluşturma sayfasına gidin.',
      },
      {
        title: 'Fotoğraf Yükleyin',
        content: 'En az 3 fotoğraf yükleyin. Farklı açılardan, iyi ışıkta çekilmiş fotoğraflar satışı artırır.',
      },
      {
        title: 'Detayları Girin',
        content: 'Marka, model, ölçek, durum ve açıklama bilgilerini eksiksiz doldurun. Ne kadar detay o kadar güven.',
      },
      {
        title: 'Fiyat Belirleyin',
        content: 'Piyasa araştırması yapın, rekabetçi bir fiyat belirleyin. Takas seçeneğini de aktif edebilirsiniz.',
      },
      {
        title: 'İlanı Yayınlayın',
        content: 'İlanınız onay sürecinden geçtikten sonra yayına alınır (genellikle 24 saat içinde).',
      },
      {
        title: 'Satış Gerçekleşti!',
        content: 'Ürünü dikkatlice paketleyin, kargoya verin ve takip numarasını sisteme girin.',
      },
    ],
  },
  {
    id: 'trade',
    title: 'Takas Rehberi',
    description: 'Model araba takası yapmak için adım adım kılavuz.',
    icon: ArrowsRightLeftIcon,
    color: 'text-purple-500',
    bgColor: 'bg-purple-50',
    steps: [
      {
        title: 'Takasa Açık Ürünleri Bulun',
        content: 'Ürün listelerinde "Takasa Açık" etiketine dikkat edin. Bu ürünlere takas teklifi gönderebilirsiniz.',
      },
      {
        title: 'Teklif Gönderin',
        content: '"Takas Teklifi" butonuna tıklayın, kendi ürünlerinizden birini seçin ve teklif gönderin.',
      },
      {
        title: 'Mesajlaşın',
        content: 'Karşı tarafla detayları görüşün. Fark varsa ek ödeme konusunda anlaşın.',
      },
      {
        title: 'Takası Onaylayın',
        content: 'Her iki taraf da onayladığında takas kesinleşir.',
      },
      {
        title: 'Karşılıklı Gönderim',
        content: 'Ürünlerinizi aynı anda kargoya verin ve takip numaralarını paylaşın.',
      },
    ],
  },
  {
    id: 'photography',
    title: 'Fotoğraf Çekim Rehberi',
    description: 'İlanlarınız için profesyonel fotoğraflar çekmek.',
    icon: CameraIcon,
    color: 'text-pink-500',
    bgColor: 'bg-pink-50',
    steps: [
      {
        title: 'Işık Çok Önemli',
        content: 'Doğal ışık kullanın, pencere kenarında gündüz çekim yapın. Flash kullanmaktan kaçının.',
      },
      {
        title: 'Arka Plan',
        content: 'Sade, tek renkli bir arka plan kullanın. Beyaz kağıt veya kumaş işinizi görür.',
      },
      {
        title: 'Farklı Açılar',
        content: 'Ön, arka, yan ve 45 derece açılardan fotoğraf çekin. Detayları gösterin.',
      },
      {
        title: 'Kusurları Gösterin',
        content: 'Çizik, eksik parça gibi kusurlar varsa yakından fotoğraflayın. Şeffaflık güven sağlar.',
      },
      {
        title: 'Ambalaj Fotoğrafı',
        content: 'Orijinal kutusu varsa mutlaka fotoğraflayın. Koleksiyoncular için çok değerli.',
      },
    ],
  },
  {
    id: 'shipping',
    title: 'Paketleme ve Kargo Rehberi',
    description: 'Ürünlerinizi güvenle göndermenin yolları.',
    icon: TruckIcon,
    color: 'text-orange-500',
    bgColor: 'bg-orange-50',
    steps: [
      {
        title: 'Koruyucu Malzeme',
        content: 'Baloncuklu naylon, köpük veya gazete kağıdı ile ürünü sarın. Hareket etmemeli.',
      },
      {
        title: 'Sağlam Kutu',
        content: 'Ürüne uygun boyutta, sağlam bir karton kutu seçin. Çok büyük kutu tehlikelidir.',
      },
      {
        title: 'Çift Kat Koruma',
        content: 'Özellikle değerli parçalar için iç içe iki kutu kullanın.',
      },
      {
        title: 'Etiketleme',
        content: 'Adres bilgilerini okunaklı yazın, "KIRILACAK EŞYA" etiketi ekleyin.',
      },
      {
        title: 'Kargoya Verin',
        content: 'Aras Kargo şubesine götürün, takip numarasını sisteme girin.',
      },
    ],
  },
];

export default function GuidesPage() {
  const { t } = useTranslation();
  const [activeGuide, setActiveGuide] = useState(GUIDES[0].id);

  const currentGuide = GUIDES.find((g) => g.id === activeGuide) || GUIDES[0];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-primary-500 to-primary-600 text-white py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold mb-4">{t('guides.title')}</h1>
          <p className="text-lg text-primary-100">
            {t('guides.subtitle')}
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* Guide Selection Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-12">
          {GUIDES.map((guide) => (
            <button
              key={guide.id}
              onClick={() => setActiveGuide(guide.id)}
              className={`p-4 rounded-xl text-center transition-all ${
                activeGuide === guide.id
                  ? 'bg-white shadow-lg ring-2 ring-primary-500'
                  : 'bg-white shadow-sm hover:shadow-md'
              }`}
            >
              <div
                className={`w-12 h-12 ${guide.bgColor} rounded-xl flex items-center justify-center mx-auto mb-3`}
              >
                <guide.icon className={`w-6 h-6 ${guide.color}`} />
              </div>
              <span className="text-sm font-medium text-gray-900">{guide.title.split(' ')[0]}</span>
            </button>
          ))}
        </div>

        {/* Active Guide Content */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {/* Guide Header */}
          <div className={`${currentGuide.bgColor} p-8`}>
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-sm">
                <currentGuide.icon className={`w-8 h-8 ${currentGuide.color}`} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{currentGuide.title}</h2>
                <p className="text-gray-600">{currentGuide.description}</p>
              </div>
            </div>
          </div>

          {/* Steps */}
          <div className="p-8">
            <div className="space-y-6">
              {currentGuide.steps.map((step, index) => (
                <div key={index} className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 bg-primary-500 text-white rounded-full flex items-center justify-center font-bold">
                      {index + 1}
                    </div>
                  </div>
                  <div className="flex-1 pt-1">
                    <h3 className="font-semibold text-gray-900 mb-2">{step.title}</h3>
                    <p className="text-gray-600">{step.content}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Tips */}
            <div className="mt-8 p-6 bg-amber-50 rounded-xl border border-amber-200">
              <div className="flex items-start gap-3">
                <StarIcon className="w-6 h-6 text-amber-500 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-amber-800 mb-2">{t('guides.proTip')}</h4>
                  <p className="text-amber-700 text-sm">
                    {currentGuide.id === 'selling' &&
                      'Detaylı açıklamalar ve kaliteli fotoğraflar, ürünlerinizin daha hızlı satılmasını sağlar. Hafta sonları yayınlanan ilanlar daha fazla görüntülenir.'}
                    {currentGuide.id === 'buying' &&
                      'Satıcı profilini ve değerlendirmelerini mutlaka kontrol edin. Sorularınız varsa satın almadan önce mesaj atın.'}
                    {currentGuide.id === 'trade' &&
                      'Takas tekliflerinde değer dengesine dikkat edin. Fark varsa açıkça belirtin.'}
                    {currentGuide.id === 'photography' &&
                      'Telefon kamerası yeterli! Önemli olan ışık ve arka plan. Düzenleme yaparken aşırıya kaçmayın.'}
                    {currentGuide.id === 'shipping' &&
                      'Kargo sigortası yaptırmayı unutmayın. Özellikle değerli parçalar için mutlaka sigorta alın.'}
                    {currentGuide.id === 'getting-started' &&
                      'Premium üyelik ile daha fazla ilan verebilir, daha düşük komisyon ödeyebilirsiniz.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Safety Tips */}
        <div className="mt-12 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl p-8 text-white">
          <div className="flex items-start gap-4">
            <ShieldCheckIcon className="w-12 h-12 flex-shrink-0" />
            <div>
              <h3 className="text-2xl font-bold mb-4">{t('guides.safetyTips')}</h3>
              <div className="grid md:grid-cols-2 gap-4">
                {[
                  'Ödemeleri her zaman platform üzerinden yapın',
                  'Şüpheli fiyatlara dikkat edin',
                  'Satıcı değerlendirmelerini kontrol edin',
                  'Kargo takip numarasını mutlaka alın',
                  'Teslimat sırasında paketi kontrol edin',
                  'Sorun olursa 24 saat içinde bildirin',
                ].map((tip, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <CheckCircleIcon className="w-5 h-5 text-green-200 flex-shrink-0" />
                    <span className="text-green-50">{tip}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Help CTA */}
        <div className="mt-12 text-center">
          <p className="text-gray-600 mb-4">{t('guides.stillHaveQuestions')}</p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/faq"
              className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
            >
              {t('guides.faqLink')}
            </Link>
            <Link
              href="/contact"
              className="px-6 py-3 bg-primary-500 text-white rounded-xl font-semibold hover:bg-primary-600 transition-colors"
            >
              {t('guides.contactLink')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

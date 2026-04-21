'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDownIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useTranslation } from '@/i18n/LanguageContext';import { Button, Input } from '@tarodan/ui';


const FAQ_CATEGORIES = [
  {
    id: 'general',
    title: 'Genel Sorular',
    icon: '🏠',
    faqs: [
      {
        question: 'TARODAN nedir?',
        answer: 'TARODAN, diecast model araba koleksiyoncuları için Türkiye\'nin en büyük online pazarıdır. Koleksiyoncular burada model arabalarını alabilir, satabilir ve takas yapabilir.',
      },
      {
        question: 'TARODAN\'a üye olmak ücretsiz mi?',
        answer: 'Evet, TARODAN\'a üye olmak tamamen ücretsizdir. Ücretsiz üyelikle aylık 5 ilan verebilirsiniz. Daha fazla ilan vermek için Premium veya Business planlarına geçebilirsiniz.',
      },
      {
        question: 'Hangi marka ve model arabalar satılıyor?',
        answer: 'TARODAN\'da Hot Wheels, Matchbox, Tomica, Majorette, Maisto, Bburago, Welly ve daha birçok marka diecast model araba bulabilirsiniz. 1:64, 1:43, 1:24, 1:18 gibi farklı ölçeklerde ürünler mevcuttur.',
      },
    ],
  },
  {
    id: 'buying',
    title: 'Satın Alma',
    icon: '🛒',
    faqs: [
      {
        question: 'Nasıl ürün satın alabilirim?',
        answer: 'İstediğiniz ürünü bulun, "Sepete Ekle" veya "Hemen Al" butonuna tıklayın. Ödeme sayfasında adres bilgilerinizi girin ve ödemenizi güvenle tamamlayın.',
      },
      {
        question: 'Hangi ödeme yöntemlerini kabul ediyorsunuz?',
        answer: 'Kredi kartı, banka kartı ve sanal kart ile ödeme yapabilirsiniz. Ödemelerimiz PayTR altyapısı ile güvenle işlenmektedir.',
      },
      {
        question: 'Siparişimi nasıl takip edebilirim?',
        answer: 'Profilinizden "Siparişlerim" sayfasına giderek tüm siparişlerinizi ve kargo durumlarını takip edebilirsiniz.',
      },
      {
        question: 'Ücretsiz kargo var mı?',
        answer: 'Evet! 500 TL ve üzeri alışverişlerinizde kargo ücretsizdir. Bu tutarın altındaki siparişlerde standart kargo ücreti 29.99 TL\'dir.',
      },
    ],
  },
  {
    id: 'selling',
    title: 'Satış Yapma',
    icon: '💰',
    faqs: [
      {
        question: 'Nasıl ilan verebilirim?',
        answer: 'Üye girişi yaptıktan sonra "İlan Ver" butonuna tıklayın. Ürün fotoğraflarını yükleyin, açıklama yazın, fiyat belirleyin ve ilanınızı yayınlayın.',
      },
      {
        question: 'İlan vermek ücretli mi?',
        answer: 'Ücretsiz üyelikte aylık 5 ilan verebilirsiniz. Daha fazla ilan için Premium (aylık 20 ilan) veya Business (sınırsız ilan) planlarını tercih edebilirsiniz.',
      },
      {
        question: 'Satış komisyonu ne kadar?',
        answer: 'Her başarılı satıştan %8 platform komisyonu alınmaktadır. Premium üyelerde bu oran %6, Business üyelerde %4\'e düşmektedir.',
      },
      {
        question: 'Paramı ne zaman alırım?',
        answer: 'Alıcının ürünü teslim almasının ardından 3 iş günü içinde ödemeniz hesabınıza aktarılır.',
      },
    ],
  },
  {
    id: 'trade',
    title: 'Takas',
    icon: '🔄',
    faqs: [
      {
        question: 'Takas nasıl çalışıyor?',
        answer: 'Takasa açık ürünlerde "Takas Teklifi" butonu görünür. Kendi ürünlerinizden birini seçerek takas teklifi gönderebilirsiniz. Satıcı kabul ederse takas gerçekleşir.',
      },
      {
        question: 'Takas için komisyon var mı?',
        answer: 'Takas işlemlerinde platform komisyonu alınmaz. Sadece kargo masrafları taraflara aittir.',
      },
      {
        question: 'Takas teklifini nasıl değerlendiririm?',
        answer: 'Gelen takas tekliflerini "Takaslar" sayfasından görebilirsiniz. Teklifi kabul edebilir, reddedebilir veya karşı teklif gönderebilirsiniz.',
      },
    ],
  },
  {
    id: 'shipping',
    title: 'Kargo ve Teslimat',
    icon: '📦',
    faqs: [
      {
        question: 'Kargo firması hangisi?',
        answer: 'Aras Kargo ile çalışıyoruz. Siparişiniz 1-3 iş günü içinde kargoya verilir ve ortalama 2-4 iş günü içinde teslim edilir.',
      },
      {
        question: 'Kargo takip numarasını nereden bulabilirim?',
        answer: 'Siparişiniz kargoya verildiğinde e-posta ile bilgilendirilirsiniz. Ayrıca "Siparişlerim" sayfasından takip numarasına ulaşabilirsiniz.',
      },
      {
        question: 'Ürün hasarlı gelirse ne yapmalıyım?',
        answer: 'Teslimat sırasında kargo görevlisi yanındayken paketi kontrol edin. Hasar varsa tutanak tutturun ve 24 saat içinde bizimle iletişime geçin.',
      },
    ],
  },
  {
    id: 'account',
    title: 'Hesap ve Güvenlik',
    icon: '🔐',
    faqs: [
      {
        question: 'Şifremi unuttum, ne yapmalıyım?',
        answer: 'Giriş sayfasında "Şifremi Unuttum" bağlantısına tıklayın. E-posta adresinize şifre sıfırlama linki gönderilecektir.',
      },
      {
        question: 'Hesabımı nasıl silebilirim?',
        answer: 'Profil ayarlarından "Hesabı Sil" seçeneğini kullanabilirsiniz. Bu işlem geri alınamaz ve tüm verileriniz silinir.',
      },
      {
        question: 'Kişisel bilgilerim güvende mi?',
        answer: 'Evet, tüm kişisel verileriniz şifrelenmiş şekilde saklanır. KVKK ve GDPR uyumlu çalışıyoruz. Detaylar için Gizlilik Politikamızı inceleyebilirsiniz.',
      },
    ],
  },
];

export default function FAQPage() {
  const { t, locale } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('general');
  const [openQuestions, setOpenQuestions] = useState<string[]>([]);

  // FAQ categories with locale-based content
  const FAQ_CATEGORIES_LOCALIZED = locale === 'en' ? [
    {
      id: 'general',
      title: 'General Questions',
      icon: '🏠',
      faqs: [
        { question: 'What is TARODAN?', answer: 'TARODAN is Turkey\'s largest online marketplace for diecast model car collectors. Collectors can buy, sell, and trade model cars here.' },
        { question: 'Is signing up for TARODAN free?', answer: 'Yes, signing up for TARODAN is completely free. With a free membership, you can list up to 5 items per month. For more listings, you can upgrade to Premium or Business plans.' },
        { question: 'What brands and models are sold?', answer: 'On TARODAN, you can find Hot Wheels, Matchbox, Tomica, Majorette, Maisto, Bburago, Welly, and many other diecast model car brands. Products are available in different scales like 1:64, 1:43, 1:24, 1:18.' },
      ],
    },
    {
      id: 'buying',
      title: 'Buying',
      icon: '🛒',
      faqs: [
        { question: 'How can I buy a product?', answer: 'Find the product you want, click "Add to Cart" or "Buy Now". Enter your address on the payment page and complete your payment securely.' },
        { question: 'What payment methods do you accept?', answer: 'You can pay with credit card, debit card, and virtual card. Our payments are processed securely through PayTR.' },
        { question: 'How can I track my order?', answer: 'You can track all your orders and shipping status by going to the "My Orders" page in your profile.' },
        { question: 'Is there free shipping?', answer: 'Yes! Orders of ₺500 and above qualify for free shipping. For orders below this amount, the standard shipping fee is ₺29.99.' },
      ],
    },
    {
      id: 'selling',
      title: 'Selling',
      icon: '💰',
      faqs: [
        { question: 'How can I create a listing?', answer: 'After logging in, click the "Create Listing" button. Upload product photos, write a description, set a price, and publish your listing.' },
        { question: 'Is it free to list items?', answer: 'With a free membership, you can list 5 items per month. For more listings, you can choose Premium (20 monthly listings) or Business (unlimited listings) plans.' },
        { question: 'What is the sales commission?', answer: 'An 8% platform commission is charged on each successful sale. This rate drops to 6% for Premium members and 4% for Business members.' },
        { question: 'When will I receive my payment?', answer: 'Your payment will be transferred to your account within 3 business days after the buyer receives the product.' },
      ],
    },
    {
      id: 'trade',
      title: 'Trade',
      icon: '🔄',
      faqs: [
        { question: 'How does trading work?', answer: 'A "Trade Offer" button appears on products open to trade. You can send a trade offer by selecting one of your products. If the seller accepts, the trade is completed.' },
        { question: 'Is there a commission for trades?', answer: 'No platform commission is charged for trade transactions. Only shipping costs are the responsibility of the parties.' },
        { question: 'How do I evaluate a trade offer?', answer: 'You can see incoming trade offers on the "Trades" page. You can accept, reject, or send a counter-offer.' },
      ],
    },
    {
      id: 'shipping',
      title: 'Shipping & Delivery',
      icon: '📦',
      faqs: [
        { question: 'Which shipping company do you use?', answer: 'We work with Aras Kargo. Your order will be shipped within 1-3 business days and delivered within an average of 2-4 business days.' },
        { question: 'Where can I find the tracking number?', answer: 'You will be notified by email when your order is shipped. You can also access the tracking number from the "My Orders" page.' },
        { question: 'What should I do if the product arrives damaged?', answer: 'Inspect the package while the courier is present. If there is damage, have it recorded and contact us within 24 hours.' },
      ],
    },
    {
      id: 'account',
      title: 'Account & Security',
      icon: '🔐',
      faqs: [
        { question: 'I forgot my password, what should I do?', answer: 'Click the "Forgot Password" link on the login page. A password reset link will be sent to your email address.' },
        { question: 'How can I delete my account?', answer: 'You can use the "Delete Account" option in profile settings. This action is irreversible and all your data will be deleted.' },
        { question: 'Is my personal information safe?', answer: 'Yes, all your personal data is stored encrypted. We comply with KVKK and GDPR. For details, please review our Privacy Policy.' },
      ],
    },
  ] : FAQ_CATEGORIES;

  const toggleQuestion = (id: string) => {
    setOpenQuestions((prev) =>
      prev.includes(id) ? prev.filter((q) => q !== id) : [...prev, id]
    );
  };

  const filteredCategories = FAQ_CATEGORIES_LOCALIZED.map((category) => ({
    ...category,
    faqs: category.faqs.filter(
      (faq) =>
        faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter((category) => category.faqs.length > 0);

  const activeData = searchQuery
    ? filteredCategories
    : FAQ_CATEGORIES_LOCALIZED.filter((c) => c.id === activeCategory);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-primary-500 to-primary-600 text-white py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold mb-4">{t('faq.title')}</h1>
          <p className="text-lg text-primary-100 mb-8">
            {t('faq.subtitle')}
          </p>

          {/* Search */}
          <div className="relative max-w-xl mx-auto">
            <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input type="text"
              placeholder={t('faq.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-xl text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-white focus:outline-none" />
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Category Sidebar */}
          {!searchQuery && (
            <div className="lg:w-64 flex-shrink-0">
              <div className="bg-white rounded-xl shadow-sm p-4 sticky top-24">
                <h3 className="font-semibold text-gray-900 mb-4">{t('faq.categories')}</h3>
                <nav className="space-y-1">
                  {FAQ_CATEGORIES_LOCALIZED.map((category) => (
                    <Button variant="secondary" key={category.id}
                      onClick={() => setActiveCategory(category.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                        activeCategory === category.id
                          ? 'bg-primary-50 text-primary-600'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}>
                      <span className="text-xl">{category.icon}</span>
                      <span className="font-medium">{category.title}</span>
                    </Button>
                  ))}
                </nav>
              </div>
            </div>
          )}

          {/* FAQ Content */}
          <div className="flex-1">
            {activeData.map((category) => (
              <div key={category.id} className="mb-8">
                <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="text-2xl">{category.icon}</span>
                  {category.title}
                </h2>
                <div className="space-y-3">
                  {category.faqs.map((faq, index) => {
                    const questionId = `${category.id}-${index}`;
                    const isOpen = openQuestions.includes(questionId);

                    return (
                      <div
                        key={questionId}
                        className="bg-white rounded-xl shadow-sm overflow-hidden"
                      >
                        <Button variant="secondary" onClick={() => toggleQuestion(questionId)}
                          className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors">
                          <span className="font-medium text-gray-900 pr-4">
                            {faq.question}
                          </span>
                          <ChevronDownIcon
                            className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${
                              isOpen ? 'rotate-180' : ''
                            }`}
                          />
                        </Button>
                        <AnimatePresence>
                          {isOpen && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                            >
                              <div className="px-4 pb-4 text-gray-600 border-t border-gray-100 pt-3">
                                {faq.answer}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {searchQuery && filteredCategories.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-500 mb-4">
                  "{searchQuery}" {t('faq.noResults')}
                </p>
                <Link href="/contact" className="text-primary-500 hover:underline">
                  {t('faq.askUs')} →
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Contact CTA */}
        <div className="mt-12 bg-gradient-to-r from-primary-500 to-primary-600 rounded-2xl p-8 text-center text-white">
          <h3 className="text-2xl font-bold mb-2">{t('faq.stillHaveQuestions')}</h3>
          <p className="text-primary-100 mb-6">
            {t('faq.supportTeamHappy')}
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/contact"
              className="px-6 py-3 bg-white text-primary-600 rounded-xl font-semibold hover:bg-primary-50 transition-colors"
            >
              {t('faq.contactUs')}
            </Link>
            <Link
              href="/help"
              className="px-6 py-3 bg-primary-400 text-white rounded-xl font-semibold hover:bg-primary-300 transition-colors"
            >
              {t('faq.helpCenter')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

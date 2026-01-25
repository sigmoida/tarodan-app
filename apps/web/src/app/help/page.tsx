'use client';

import Link from 'next/link';
import {
  QuestionMarkCircleIcon,
  ShoppingCartIcon,
  CurrencyDollarIcon,
  ArrowsRightLeftIcon,
  TruckIcon,
  ShieldCheckIcon,
  UserCircleIcon,
  CreditCardIcon,
  ChatBubbleLeftRightIcon,
  DocumentTextIcon,
  PhoneIcon,
  EnvelopeIcon,
} from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n/LanguageContext';

const HELP_CATEGORIES = [
  {
    title: 'Başlangıç',
    description: 'TARODAN\'a yeni misiniz? Buradan başlayın.',
    icon: QuestionMarkCircleIcon,
    color: 'bg-blue-500',
    links: [
      { href: '/guides', label: 'Kullanım Kılavuzu' },
      { href: '/faq', label: 'Sıkça Sorulan Sorular' },
      { href: '/register', label: 'Üye Olun' },
    ],
  },
  {
    title: 'Satın Alma',
    description: 'Ürün arama, sipariş verme ve ödeme işlemleri.',
    icon: ShoppingCartIcon,
    color: 'bg-green-500',
    links: [
      { href: '/faq#buying', label: 'Nasıl Alışveriş Yapılır?' },
      { href: '/faq#shipping', label: 'Kargo Bilgileri' },
      { href: '/faq#buying', label: 'Ödeme Yöntemleri' },
    ],
  },
  {
    title: 'Satış Yapma',
    description: 'İlan verme ve satış süreçleri hakkında.',
    icon: CurrencyDollarIcon,
    color: 'bg-yellow-500',
    links: [
      { href: '/guides#selling', label: 'İlan Verme Rehberi' },
      { href: '/faq#selling', label: 'Komisyon Oranları' },
      { href: '/pricing', label: 'Üyelik Planları' },
    ],
  },
  {
    title: 'Takas',
    description: 'Model araba takas işlemleri.',
    icon: ArrowsRightLeftIcon,
    color: 'bg-purple-500',
    links: [
      { href: '/faq#trade', label: 'Takas Nasıl Çalışır?' },
      { href: '/guides#trade', label: 'Takas Rehberi' },
      { href: '/trades', label: 'Takaslarım' },
    ],
  },
  {
    title: 'Kargo ve Teslimat',
    description: 'Gönderim ve teslimat süreçleri.',
    icon: TruckIcon,
    color: 'bg-orange-500',
    links: [
      { href: '/faq#shipping', label: 'Kargo Takibi' },
      { href: '/faq#shipping', label: 'Teslimat Süreleri' },
      { href: '/faq#shipping', label: 'Hasarlı Ürün' },
    ],
  },
  {
    title: 'Güvenlik',
    description: 'Hesap güvenliği ve gizlilik.',
    icon: ShieldCheckIcon,
    color: 'bg-red-500',
    links: [
      { href: '/faq#account', label: 'Şifre İşlemleri' },
      { href: '/privacy', label: 'Gizlilik Politikası' },
      { href: '/settings/security', label: 'Güvenlik Ayarları' },
    ],
  },
  {
    title: 'Hesap',
    description: 'Profil ve hesap yönetimi.',
    icon: UserCircleIcon,
    color: 'bg-indigo-500',
    links: [
      { href: '/profile/edit', label: 'Profil Düzenleme' },
      { href: '/profile/addresses', label: 'Adres Yönetimi' },
      { href: '/faq#account', label: 'Hesap Silme' },
    ],
  },
  {
    title: 'Ödeme',
    description: 'Ödeme ve iade işlemleri.',
    icon: CreditCardIcon,
    color: 'bg-teal-500',
    links: [
      { href: '/faq#buying', label: 'Ödeme Yöntemleri' },
      { href: '/profile/payments', label: 'Ödeme Geçmişi' },
      { href: '/contact', label: 'İade Talebi' },
    ],
  },
];

const QUICK_LINKS = [
  { href: '/faq', label: 'Sıkça Sorulan Sorular', icon: QuestionMarkCircleIcon },
  { href: '/guides', label: 'Kullanım Kılavuzları', icon: DocumentTextIcon },
  { href: '/contact', label: 'İletişim Formu', icon: ChatBubbleLeftRightIcon },
];

export default function HelpCenterPage() {
  const { t, locale } = useTranslation();
  
  const QUICK_LINKS_LOCALIZED = locale === 'en' ? [
    { href: '/faq', label: 'Frequently Asked Questions', icon: QuestionMarkCircleIcon },
    { href: '/guides', label: 'User Guides', icon: DocumentTextIcon },
    { href: '/contact', label: 'Contact Form', icon: ChatBubbleLeftRightIcon },
  ] : QUICK_LINKS;
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-primary-500 to-primary-600 text-white py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold mb-4">{t('help.title')}</h1>
          <p className="text-lg text-primary-100 mb-8">
            {t('help.subtitle')}
          </p>

          {/* Quick Links */}
          <div className="flex flex-wrap justify-center gap-4">
            {QUICK_LINKS_LOCALIZED.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center gap-2 px-5 py-3 bg-white/20 rounded-xl hover:bg-white/30 transition-colors"
              >
                <link.icon className="w-5 h-5" />
                <span className="font-medium">{link.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* Help Categories Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {HELP_CATEGORIES.map((category) => (
            <div
              key={category.title}
              className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow"
            >
              <div
                className={`w-12 h-12 ${category.color} rounded-xl flex items-center justify-center mb-4`}
              >
                <category.icon className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">{category.title}</h3>
              <p className="text-sm text-gray-500 mb-4">{category.description}</p>
              <ul className="space-y-2">
                {category.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-primary-500 hover:text-primary-600 hover:underline"
                    >
                      {link.label} →
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Popular Articles */}
        <div className="bg-white rounded-xl shadow-sm p-8 mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">{t('help.popularTopics')}</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {[
              { q: 'İlk satışımı nasıl yaparım?', href: '/guides#selling' },
              { q: '500 TL üzeri ücretsiz kargo nasıl çalışır?', href: '/faq#buying' },
              { q: 'Takas teklifi nasıl gönderirim?', href: '/faq#trade' },
              { q: 'Üyelik planları arasındaki farklar nelerdir?', href: '/pricing' },
              { q: 'Siparişimi nasıl takip ederim?', href: '/faq#shipping' },
              { q: 'İade ve değişim politikası nedir?', href: '/terms' },
            ].map((item) => (
              <Link
                key={item.q}
                href={item.href}
                className="flex items-center gap-3 p-4 rounded-lg border border-gray-100 hover:border-primary-200 hover:bg-primary-50 transition-colors"
              >
                <QuestionMarkCircleIcon className="w-5 h-5 text-primary-500 flex-shrink-0" />
                <span className="text-gray-700">{item.q}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Contact Section */}
        <div className="bg-gradient-to-r from-gray-800 to-gray-900 rounded-2xl p-8 text-white">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <h2 className="text-2xl font-bold mb-4">{t('help.needMoreHelp')}</h2>
              <p className="text-gray-300 mb-6">
                {t('help.supportReady')} {t('help.businessHours')}
              </p>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <EnvelopeIcon className="w-5 h-5 text-primary-400" />
                  <span>destek@tarodan.com</span>
                </div>
                <div className="flex items-center gap-3">
                  <PhoneIcon className="w-5 h-5 text-primary-400" />
                  <span>0850 XXX XX XX</span>
                </div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/contact"
                className="flex-1 text-center px-6 py-4 bg-primary-500 text-white rounded-xl font-semibold hover:bg-primary-600 transition-colors"
              >
                <ChatBubbleLeftRightIcon className="w-6 h-6 mx-auto mb-2" />
                {t('help.contactForm')}
              </Link>
              <Link
                href="/faq"
                className="flex-1 text-center px-6 py-4 bg-white/10 text-white rounded-xl font-semibold hover:bg-white/20 transition-colors"
              >
                <QuestionMarkCircleIcon className="w-6 h-6 mx-auto mb-2" />
                {t('footer.faq')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

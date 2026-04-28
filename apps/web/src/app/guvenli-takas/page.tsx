'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ShieldCheckIcon,
  TruckIcon,
  ArrowsRightLeftIcon,
  CheckCircleIcon,
  ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n/LanguageContext';
import { useAuthStore } from '@/stores/authStore';

const STEPS = {
  tr: [
    {
      icon: ChatBubbleLeftRightIcon,
      title: 'Takas Teklifi Gönderin',
      description: 'İlgilendiğiniz bir ürüne takas teklifi gönderin. Karşı tarafa hangi ürünlerinizi teklif ettiğinizi belirtin.',
    },
    {
      icon: ArrowsRightLeftIcon,
      title: 'Karşılıklı Onay',
      description: 'Her iki taraf da takası onayladığında süreç başlar. Mesajlaşarak detayları netleştirin.',
    },
    {
      icon: TruckIcon,
      title: 'Güvenli Kargo',
      description: 'Ürünlerinizi anlaşmalı kargo ile gönderin. Kargo takip numarası sistem üzerinden paylaşılır.',
    },
    {
      icon: CheckCircleIcon,
      title: 'Takas Tamamlandı',
      description: 'Her iki taraf da ürünü teslim aldığında takas tamamlanır. Karşılıklı değerlendirme yapılır.',
    },
  ],
  en: [
    {
      icon: ChatBubbleLeftRightIcon,
      title: 'Send a Trade Offer',
      description: 'Send a trade offer for a product you are interested in. Specify which of your products you are offering.',
    },
    {
      icon: ArrowsRightLeftIcon,
      title: 'Mutual Approval',
      description: 'The process begins when both parties approve the trade. Discuss details via messaging.',
    },
    {
      icon: TruckIcon,
      title: 'Secure Shipping',
      description: 'Ship your products via contracted courier. Tracking numbers are shared through the system.',
    },
    {
      icon: CheckCircleIcon,
      title: 'Trade Completed',
      description: 'The trade is completed when both parties receive their items. Mutual reviews are exchanged.',
    },
  ],
};

const GUARANTEES = {
  tr: [
    { title: 'Doğrulanmış Üyeler', description: 'Takas yapabilmek için e-posta doğrulaması zorunludur.' },
    { title: 'Kargo Takibi', description: 'Tüm kargolar sistem üzerinden takip edilir.' },
    { title: 'Anlaşmazlık Çözümü', description: 'Sorun yaşandığında destek ekibimiz devreye girer.' },
    { title: 'Değerlendirme Sistemi', description: 'Her takas sonrası puanlama ile güvenilir kullanıcılar ön plana çıkar.' },
  ],
  en: [
    { title: 'Verified Members', description: 'Email verification is required to make trades.' },
    { title: 'Shipment Tracking', description: 'All shipments are tracked through the system.' },
    { title: 'Dispute Resolution', description: 'Our support team steps in when issues arise.' },
    { title: 'Rating System', description: 'Post-trade ratings highlight reliable users.' },
  ],
};

const FAQ = {
  tr: [
    { q: 'Takas ücretsiz mi?', a: 'Evet, takas işlemi için herhangi bir komisyon alınmaz. Sadece kargo ücretini siz karşılarsınız.' },
    { q: 'Takas teklifi nasıl gönderilir?', a: 'İlgilendiğiniz ürünün sayfasında "Takas Teklifi Gönder" butonuna tıklayarak kendi ürünlerinizden birini seçin.' },
    { q: 'Karşı taraf teklifi reddederse ne olur?', a: 'Hiçbir yükümlülüğünüz olmaz. Farklı bir teklif gönderebilir veya farklı ürünler arayabilirsiniz.' },
    { q: 'Sorun yaşarsam ne yapmalıyım?', a: 'Destek ekibimizle iletişime geçin. Anlaşmazlık çözüm sürecimiz her iki tarafı da koruma altına alır.' },
  ],
  en: [
    { q: 'Is trading free?', a: 'Yes, there is no commission for trade transactions. You only pay for shipping.' },
    { q: 'How do I send a trade offer?', a: 'Click "Send Trade Offer" on the product page you are interested in and select one of your products.' },
    { q: 'What if the other party rejects the offer?', a: 'You have no obligation. You can send a different offer or browse other products.' },
    { q: 'What should I do if there is a problem?', a: 'Contact our support team. Our dispute resolution process protects both parties.' },
  ],
};

export default function GuvenliTakasPage() {
  const { locale } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const lang = (locale as 'tr' | 'en') || 'tr';

  return (
    <div className="min-h-screen bg-surface-elevated">
      {/* Hero */}
      <section className="bg-surface-elevated border-b border-border">
        <div className="mx-auto px-6 sm:px-8 lg:px-12 xl:px-16 py-16 md:py-20 text-center">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-50 rounded mb-6">
              <ShieldCheckIcon className="w-8 h-8 text-primary-500" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-heading mb-4">
              {lang === 'en' ? 'Secure Trade System' : 'Güvenli Takas Sistemi'}
            </h1>
            <p className="text-muted text-lg max-w-2xl mx-auto">
              {lang === 'en'
                ? 'Trade your collectibles with other collectors safely. Our system protects both parties at every step.'
                : 'Koleksiyonlarınızı diğer koleksiyonerlerle güvenle takas edin. Sistemimiz her adımda iki tarafı da korur.'}
            </p>
          </motion.div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-14">
        <div className="mx-auto px-6 sm:px-8 lg:px-12 xl:px-16">
          <div className="flex items-center justify-center gap-3 mb-10">
            <div className="w-1 h-6 bg-primary-500 rounded-sm" />
            <h2 className="text-2xl font-bold">
              {lang === 'en' ? 'How It Works' : 'Nasıl Çalışır?'}
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {STEPS[lang].map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1, duration: 0.4 }}
                className="relative bg-surface border border-border-subtle rounded p-5"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-primary-50 rounded flex items-center justify-center flex-shrink-0">
                    <step.icon className="w-5 h-5 text-primary-500" />
                  </div>
                  <span className="text-xs font-bold text-subtle uppercase">
                    {lang === 'en' ? `Step ${i + 1}` : `Adım ${i + 1}`}
                  </span>
                </div>
                <h3 className="font-semibold text-heading mb-1.5">{step.title}</h3>
                <p className="text-sm text-muted leading-relaxed">{step.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Guarantees */}
      <section className="py-14 bg-surface">
        <div className="mx-auto px-6 sm:px-8 lg:px-12 xl:px-16">
          <div className="flex items-center justify-center gap-3 mb-10">
            <div className="w-1 h-6 bg-primary-500 rounded-sm" />
            <h2 className="text-2xl font-bold">
              {lang === 'en' ? 'Security Guarantees' : 'Güvenlik Garantileri'}
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {GUARANTEES[lang].map((item, i) => (
              <div key={i} className="bg-surface-elevated border border-border-subtle rounded p-5 flex items-start gap-4">
                <CheckCircleIcon className="w-5 h-5 text-primary-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-heading mb-1">{item.title}</h3>
                  <p className="text-sm text-muted">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-14">
        <div className="mx-auto px-6 sm:px-8 lg:px-12 xl:px-16 max-w-3xl">
          <div className="flex items-center justify-center gap-3 mb-10">
            <div className="w-1 h-6 bg-primary-500 rounded-sm" />
            <h2 className="text-2xl font-bold">
              {lang === 'en' ? 'Frequently Asked Questions' : 'Sıkça Sorulan Sorular'}
            </h2>
          </div>
          <div className="space-y-4">
            {FAQ[lang].map((item, i) => (
              <div key={i} className="bg-surface border border-border-subtle rounded p-5">
                <h3 className="font-semibold text-heading mb-2">{item.q}</h3>
                <p className="text-sm text-muted leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 bg-surface">
        <div className="mx-auto px-6 sm:px-8 lg:px-12 xl:px-16 max-w-3xl text-center">
          <div className="flex items-center justify-center gap-3 mb-3">
            <div className="w-1 h-6 bg-primary-500 rounded-sm" />
            <h2 className="text-2xl font-bold">
              {lang === 'en' ? 'Ready to Start Trading?' : 'Takasa Başlamaya Hazır mısınız?'}
            </h2>
          </div>
          <p className="text-muted mb-8">
            {lang === 'en'
              ? 'Browse listings and send your first trade offer today.'
              : 'İlanları inceleyin ve ilk takas teklifinizi bugün gönderin.'}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href={isAuthenticated ? '/trades' : '/login?redirect=/trades'}
              className="inline-flex items-center justify-center gap-2 bg-primary-500 hover:bg-primary-600 text-inverted text-sm font-semibold px-6 py-3 rounded transition-colors"
            >
              <ArrowsRightLeftIcon className="w-5 h-5" />
              {lang === 'en' ? 'Start Trading' : 'Takasa Başla'}
            </Link>
            <Link
              href="/listings"
              className="inline-flex items-center justify-center gap-2 bg-surface-elevated border border-border hover:border-border text-body text-sm font-semibold px-6 py-3 rounded transition-colors"
            >
              {lang === 'en' ? 'Browse Listings' : 'İlanları İncele'}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

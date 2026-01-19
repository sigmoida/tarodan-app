'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  CheckIcon,
  XMarkIcon,
  StarIcon,
} from '@heroicons/react/24/solid';
import { useAuthStore } from '@/stores/authStore';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import Footer from '@/components/layout/Footer';

const MEMBERSHIP_TIERS = [
  {
    id: 'free',
    name: 'Ücretsiz',
    price: 0,
    period: 'Süresiz',
    description: 'Başlangıç için ideal',
    features: [
      { text: '5 aktif ilan hakkı', included: true },
      { text: 'Temel arama ve filtreleme', included: true },
      { text: 'Mesajlaşma', included: true },
      { text: 'Takas yapma', included: false },
      { text: 'Koleksiyon oluşturma', included: false },
      { text: 'Reklamsız deneyim', included: false },
      { text: 'Öncelikli destek', included: false },
    ],
    popular: false,
    color: 'gray',
  },
  {
    id: 'basic',
    name: 'Temel',
    price: 99,
    period: 'Aylık',
    description: 'Daha fazla özellik',
    features: [
      { text: '50 aktif ilan hakkı', included: true },
      { text: 'Temel arama ve filtreleme', included: true },
      { text: 'Mesajlaşma', included: true },
      { text: 'Takas yapma', included: true },
      { text: 'Koleksiyon oluşturma', included: true },
      { text: 'Reklamsız deneyim', included: false },
      { text: 'Öncelikli destek', included: false },
    ],
    popular: true,
    color: 'blue',
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 199,
    period: 'Aylık',
    description: 'En popüler seçenek',
    features: [
      { text: '200 aktif ilan hakkı', included: true },
      { text: 'Gelişmiş arama ve filtreleme', included: true },
      { text: 'Mesajlaşma', included: true },
      { text: 'Takas yapma', included: true },
      { text: 'Sınırsız koleksiyon', included: true },
      { text: 'Reklamsız deneyim', included: true },
      { text: 'Öncelikli destek', included: true },
    ],
    popular: false,
    color: 'purple',
  },
  {
    id: 'business',
    name: 'İş',
    price: 499,
    period: 'Aylık',
    description: 'Profesyonel satıcılar için',
    features: [
      { text: '1000 aktif ilan hakkı', included: true },
      { text: 'Gelişmiş arama ve filtreleme', included: true },
      { text: 'Mesajlaşma', included: true },
      { text: 'Takas yapma', included: true },
      { text: 'Sınırsız koleksiyon', included: true },
      { text: 'Reklamsız deneyim', included: true },
      { text: '7/24 öncelikli destek', included: true },
      { text: 'Özel API erişimi', included: true },
    ],
    popular: false,
    color: 'gold',
  },
];

export default function PricingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, user } = useAuthStore();
  const [selectedPeriod, setSelectedPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [selectedTier, setSelectedTier] = useState<string | null>(null);

  useEffect(() => {
    const tier = searchParams.get('tier');
    if (tier) {
      setSelectedTier(tier);
      // Scroll to specific tier
      setTimeout(() => {
        const element = document.getElementById(`tier-${tier}`);
        element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [searchParams]);

  const currentTier = user?.membershipTier || 'free';

  const handleSelectTier = (tierId: string) => {
    if (tierId === 'free') {
      toast.info('Ücretsiz plan zaten mevcut');
      return;
    }
    if (tierId === currentTier) {
      toast.info('Bu plan zaten aktif');
      return;
    }
    setSelectedTier(tierId);
  };

  const handleContinue = () => {
    if (!selectedTier || selectedTier === 'free') {
      toast.error('Lütfen bir plan seçin');
      return;
    }

    if (!isAuthenticated) {
      toast.error('Devam etmek için giriş yapmalısınız');
      router.push(`/login?redirect=/pricing?tier=${selectedTier}`);
      return;
    }

    // Redirect to membership checkout
    router.push(`/membership/checkout?tier=${selectedTier}&period=${selectedPeriod}`);
  };

  return (
    <div className="min-h-screen bg-gray-50">

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Üyelik Planları
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            İhtiyacınıza uygun planı seçin ve diecast model araba ticaretinizi büyütün
          </p>
        </div>

        {/* Period Toggle */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex bg-white rounded-lg p-1 shadow-sm border border-gray-200">
            <button
              onClick={() => setSelectedPeriod('monthly')}
              className={`px-6 py-2 rounded-md font-medium transition-colors ${
                selectedPeriod === 'monthly'
                  ? 'bg-primary-500 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Aylık
            </button>
            <button
              onClick={() => setSelectedPeriod('yearly')}
              className={`px-6 py-2 rounded-md font-medium transition-colors ${
                selectedPeriod === 'yearly'
                  ? 'bg-primary-500 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Yıllık
              <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                %20 İndirim
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {MEMBERSHIP_TIERS.map((tier, index) => {
            const displayPrice = selectedPeriod === 'yearly' && tier.price > 0
              ? Math.round(tier.price * 12 * 0.8)
              : tier.price;
            
            const isSelected = selectedTier === tier.id;
            const isCurrent = currentTier === tier.id;
            
            return (
              <motion.div
                key={tier.id}
                id={`tier-${tier.id}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                onClick={() => tier.price > 0 && handleSelectTier(tier.id)}
                className={`relative bg-white rounded-xl shadow-lg border-2 overflow-hidden transition-all cursor-pointer ${
                  isSelected
                    ? 'border-primary-500 ring-2 ring-primary-500 scale-105'
                    : tier.popular
                    ? 'border-primary-300 hover:border-primary-400'
                    : 'border-gray-200 hover:border-gray-300'
                } ${tier.price === 0 ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {tier.popular && !isSelected && (
                  <div className="absolute top-0 right-0 bg-primary-500 text-white px-4 py-1 text-sm font-semibold rounded-bl-lg">
                    Popüler
                  </div>
                )}
                {isSelected && (
                  <div className="absolute top-0 right-0 bg-green-500 text-white px-4 py-1 text-sm font-semibold rounded-bl-lg flex items-center gap-1">
                    <CheckIcon className="w-4 h-4" />
                    Seçildi
                  </div>
                )}
                {isCurrent && !isSelected && (
                  <div className="absolute top-0 left-0 bg-blue-500 text-white px-4 py-1 text-sm font-semibold rounded-br-lg">
                    Mevcut
                  </div>
                )}

                <div className="p-6">
                  {/* Tier Header */}
                  <div className="mb-6">
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">
                      {tier.name}
                    </h3>
                    <p className="text-gray-600 text-sm">{tier.description}</p>
                  </div>

                  {/* Price */}
                  <div className="mb-6">
                    <div className="flex items-baseline">
                      <span className="text-4xl font-bold text-gray-900">
                        {tier.price === 0 ? 'Ücretsiz' : `₺${displayPrice.toLocaleString('tr-TR')}`}
                      </span>
                      {tier.price > 0 && (
                        <span className="ml-2 text-gray-500">
                          /{selectedPeriod === 'yearly' ? 'yıl' : 'ay'}
                        </span>
                      )}
                    </div>
                    {selectedPeriod === 'yearly' && tier.price > 0 && (
                      <p className="text-sm text-gray-500 mt-1">
                        Ayda ₺{Math.round(displayPrice / 12).toLocaleString('tr-TR')}
                      </p>
                    )}
                  </div>

                  {/* Features */}
                  <ul className="space-y-3 mb-6">
                    {tier.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start">
                        {feature.included ? (
                          <CheckIcon className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                        ) : (
                          <XMarkIcon className="w-5 h-5 text-gray-300 mr-2 flex-shrink-0 mt-0.5" />
                        )}
                        <span
                          className={`text-sm ${
                            feature.included ? 'text-gray-700' : 'text-gray-400'
                          }`}
                        >
                          {feature.text}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {/* Selection indicator */}
                  <div className={`w-full py-3 rounded-lg font-semibold text-center transition-colors ${
                    isSelected
                      ? 'bg-primary-500 text-white'
                      : isCurrent
                      ? 'bg-blue-100 text-blue-700'
                      : tier.price === 0
                      ? 'bg-gray-100 text-gray-400'
                      : 'bg-gray-100 text-gray-700 group-hover:bg-gray-200'
                  }`}>
                    {isCurrent ? 'Mevcut Planınız' : tier.price === 0 ? 'Ücretsiz' : isSelected ? 'Seçildi' : 'Seç'}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Continue Button */}
        {selectedTier && selectedTier !== 'free' && selectedTier !== currentTier && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-center mb-12"
          >
            <button
              onClick={handleContinue}
              className="px-12 py-4 bg-primary-500 text-white text-lg font-semibold rounded-xl hover:bg-primary-600 transition-colors shadow-lg hover:shadow-xl"
            >
              {isAuthenticated ? 'Ödemeye Devam Et' : 'Giriş Yap ve Devam Et'}
            </button>
          </motion.div>
        )}

        {/* FAQ Section */}
        <div className="max-w-3xl mx-auto mt-16">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
            Sık Sorulan Sorular
          </h2>
          <div className="space-y-4">
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-2">
                Plan değiştirebilir miyim?
              </h3>
              <p className="text-gray-600">
                Evet, istediğiniz zaman planınızı yükseltebilir veya düşürebilirsiniz. 
                Değişiklikler hemen geçerli olur.
              </p>
            </div>
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-2">
                İlan limitim dolduğunda ne olur?
              </h3>
              <p className="text-gray-600">
                İlan limitiniz dolduğunda yeni ilan ekleyemezsiniz. 
                Mevcut ilanlarınızı kaldırarak veya planınızı yükselterek devam edebilirsiniz.
              </p>
            </div>
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-2">
                Takas özelliği nasıl çalışır?
              </h3>
              <p className="text-gray-600">
                Temel, Premium ve İş planlarında takas yapabilirsiniz. 
                Ürünlerinizi başka kullanıcıların ürünleriyle takas edebilir, 
                isteğe bağlı olarak nakit fark ekleyebilirsiniz.
              </p>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

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
import { useTranslation } from '@/i18n';


export default function PricingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuthStore();
  const [selectedPeriod, setSelectedPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [selectedTier, setSelectedTier] = useState<string | null>(null);

  const MEMBERSHIP_TIERS = [
    {
      id: 'free',
      name: t('membership.free'),
      price: 0,
      period: t('membership.perMonth'),
      description: t('membership.subtitle'),
      features: [
        { text: `5 ${t('membership.listingsLimit')}`, included: true },
        { text: t('search.search'), included: true },
        { text: t('message.messages'), included: true },
        { text: t('nav.trades'), included: false },
        { text: t('collection.collections'), included: false },
        { text: t('membership.noAds'), included: false },
      ],
      popular: false,
      color: 'gray',
    },
    {
      id: 'premium',
      name: t('membership.premium'),
      price: 99,
      period: t('membership.perMonth'),
      description: t('membership.mostPopular'),
      features: [
        { text: `${t('membership.unlimited')} ${t('membership.listingsLimit')}`, included: true },
        { text: '15 resim/ilan', included: true },
        { text: t('nav.trades'), included: true },
        { text: `${t('membership.unlimited')} ${t('collection.collections')}`, included: true },
        { text: t('membership.noAds'), included: true },
        { text: '3 öne çıkan ilan', included: true },
      ],
      popular: true,
      color: 'purple',
    },
    {
      id: 'business',
      name: t('membership.business'),
      price: 499,
      period: t('membership.perMonth'),
      description: t('membership.business'),
      features: [
        { text: `1000 ${t('membership.listingsLimit')}`, included: true },
        { text: t('search.search'), included: true },
        { text: t('message.messages'), included: true },
        { text: t('nav.trades'), included: true },
        { text: `${t('membership.unlimited')} ${t('collection.collections')}`, included: true },
        { text: t('membership.noAds'), included: true },
        { text: `24/7 ${t('membership.prioritySupport')}`, included: true },
        { text: 'API', included: true },
      ],
      popular: false,
      color: 'gold',
    },
  ];

  useEffect(() => {
    const tier = searchParams.get('tier');
    if (tier) {
      setSelectedTier(tier);
      setTimeout(() => {
        const element = document.getElementById(`tier-${tier}`);
        element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [searchParams]);

  const currentTier = isAuthenticated ? (user?.membershipTier || 'free') : null;

  const handleSelectTier = (tierId: string) => {
    if (tierId === 'free') {
      toast.info(t('membership.planAlreadyActive'));
      return;
    }
    if (tierId === currentTier) {
      toast.info(t('membership.planAlreadyActive'));
      return;
    }
    setSelectedTier(tierId);
  };

  const handleContinue = () => {
    if (!selectedTier || selectedTier === 'free') {
      toast.error(t('membership.selectPlan'));
      return;
    }

    if (!isAuthenticated) {
      toast.error(t('membership.loginToContinue'));
      router.push(`/login?redirect=/pricing?tier=${selectedTier}`);
      return;
    }

    router.push(`/membership/checkout?tier=${selectedTier}&period=${selectedPeriod}`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">{t('membership.title')}</h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            {t('membership.subtitle')}
          </p>
          
          {!isAuthenticated && (
            <div className="mt-6 bg-orange-50 border border-orange-200 rounded-xl p-4 max-w-md mx-auto">
              <p className="text-gray-700">{t('auth.noAccount')}</p>
              <p className="text-sm text-gray-600 mt-1">
                {t('auth.memberBenefits')}
              </p>
            </div>
          )}
          
          {isAuthenticated && currentTier && currentTier !== 'free' && (
            <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4 max-w-md mx-auto">
              <p className="text-blue-800 font-medium">
                {t('membership.currentPlan')}: {MEMBERSHIP_TIERS.find(tier => tier.id === currentTier)?.name || t('membership.free')}
              </p>
            </div>
          )}
        </div>

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
              {t('membership.monthly')}
            </button>
            <button
              onClick={() => setSelectedPeriod('yearly')}
              className={`px-6 py-2 rounded-md font-medium transition-colors ${
                selectedPeriod === 'yearly'
                  ? 'bg-primary-500 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('membership.yearly')}
              <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                20% {t('membership.savePercent')}
              </span>
            </button>
          </div>
        </div>

        <div className="flex justify-center mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl">
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
                onClick={() => {
                  if (tier.price === 0 && !isAuthenticated) {
                    router.push('/register');
                    return;
                  }
                  if (tier.price > 0) {
                    handleSelectTier(tier.id);
                  }
                }}
                className={`relative bg-white rounded-xl shadow-lg border-2 overflow-hidden transition-all cursor-pointer ${
                  isSelected
                    ? 'border-primary-500 ring-2 ring-primary-500 scale-105'
                    : tier.popular
                    ? 'border-primary-300 hover:border-primary-400'
                    : 'border-gray-200 hover:border-gray-300'
                } ${tier.price === 0 && isAuthenticated ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {tier.popular && !isSelected && (
                  <div className="absolute top-0 right-0 bg-primary-500 text-white px-4 py-1 text-sm font-semibold rounded-bl-lg">
                    {t('membership.mostPopular')}
                  </div>
                )}
                {isSelected && (
                  <div className="absolute top-0 right-0 bg-green-500 text-white px-4 py-1 text-sm font-semibold rounded-bl-lg flex items-center gap-1">
                    <CheckIcon className="w-4 h-4" />
                    {t('common.selected')}
                  </div>
                )}
                {isCurrent && !isSelected && (
                  <div className="absolute top-0 left-0 bg-blue-500 text-white px-4 py-1 text-sm font-semibold rounded-br-lg">
                    {t('membership.currentPlan')}
                  </div>
                )}

                <div className="p-6">
                  <div className="mb-6">
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">{tier.name}</h3>
                    <p className="text-gray-600 text-sm">{tier.description}</p>
                  </div>

                  <div className="mb-6">
                    <div className="flex items-baseline">
                      <span className="text-4xl font-bold text-gray-900">
                        {tier.price === 0 ? 'Ücretsiz' : `${displayPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`}
                      </span>
                      {tier.price > 0 && (
                        <span className="ml-2 text-gray-500">
                          /{selectedPeriod === 'yearly' ? 'yıl' : 'ay'}
                        </span>
                      )}
                    </div>
                    {selectedPeriod === 'yearly' && tier.price > 0 && (
                      <p className="text-sm text-gray-500 mt-1">
                        Ayda {Math.round(displayPrice / 12).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                      </p>
                    )}
                  </div>

                  <ul className="space-y-3 mb-6">
                    {tier.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start">
                        {feature.included ? (
                          <CheckIcon className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                        ) : (
                          <XMarkIcon className="w-5 h-5 text-gray-300 mr-2 flex-shrink-0 mt-0.5" />
                        )}
                        <span className={`text-sm ${feature.included ? 'text-gray-700' : 'text-gray-400'}`}>
                          {feature.text}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className={`w-full py-3 rounded-lg font-semibold text-center transition-colors ${
                    isSelected
                      ? 'bg-primary-500 text-white'
                      : isCurrent
                      ? 'bg-blue-100 text-blue-700'
                      : tier.price === 0 && !isAuthenticated
                      ? 'bg-primary-500 text-white hover:bg-primary-600'
                      : tier.price === 0 && isAuthenticated
                      ? 'bg-gray-100 text-gray-400'
                      : 'bg-gray-100 text-gray-700 group-hover:bg-gray-200'
                  }`}>
                    {isCurrent ? t('membership.currentPlan') : tier.price === 0 && !isAuthenticated ? t('common.freeStart') : tier.price === 0 ? t('membership.free') : isSelected ? t('common.selected') : t('common.select')}
                  </div>
                </div>
              </motion.div>
            );
          })}
          </div>
        </div>

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
              {isAuthenticated ? t('common.continue') : t('auth.loginToContinue')}
            </button>
          </motion.div>
        )}

        <div className="max-w-3xl mx-auto mt-16">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">{t('nav.faq')}</h2>
          <div className="space-y-4">
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-2">{t('membership.upgrade')}?</h3>
              <p className="text-gray-600">
                {t('membership.subtitle')}
              </p>
            </div>
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-2">{t('membership.listingsLimit')}?</h3>
              <p className="text-gray-600">
                {t('membership.features')}
              </p>
            </div>
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-2">{t('nav.trades')}?</h3>
              <p className="text-gray-600">
                {t('trade.tradeRequiresLogin')}
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

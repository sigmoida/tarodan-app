'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  CheckIcon,
  XMarkIcon,
  StarIcon,
  ArrowLeftIcon,
} from '@heroicons/react/24/solid';
import { CreditCardIcon, CalendarIcon } from '@heroicons/react/24/outline';
import { useAuthStore } from '@/stores/authStore';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useTranslation } from '@/i18n';

export default function MembershipPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t, locale } = useTranslation();
  const { isAuthenticated, user } = useAuthStore();
  const [selectedPeriod, setSelectedPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [listingLimits, setListingLimits] = useState<{
    free_listing_limit?: number;
    premium_listing_limit?: number;
    business_listing_limit?: number;
  }>({});
  const [membershipPrices, setMembershipPrices] = useState<{
    premium_monthly_price?: number;
    premium_yearly_price?: number;
    business_monthly_price?: number;
    business_yearly_price?: number;
    yearly_discount_percentage?: number;
  }>({});
  const [membershipDetails, setMembershipDetails] = useState<{
    currentPeriodStart?: string;
    currentPeriodEnd?: string;
    tier?: string;
  } | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<Array<{
    id: string;
    cardBrand: string;
    lastFour: string;
    expiryMonth: number;
    expiryYear: number;
    isDefault: boolean;
  }>>([]);

  // Fetch listing limits and membership prices from platform settings
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await api.get('/admin/settings/public');
        const settings = response.data || {};
        setListingLimits({
          free_listing_limit: settings.free_listing_limit,
          premium_listing_limit: settings.premium_listing_limit,
          business_listing_limit: settings.business_listing_limit,
        });
        setMembershipPrices({
          premium_monthly_price: settings.premium_monthly_price,
          premium_yearly_price: settings.premium_yearly_price,
          business_monthly_price: settings.business_monthly_price,
          business_yearly_price: settings.business_yearly_price,
          yearly_discount_percentage: settings.yearly_discount_percentage,
        });
      } catch (error) {
        if (process.env.NODE_ENV === 'development') console.error('Failed to fetch settings:', error);
        // Use defaults if API fails
        setListingLimits({
          free_listing_limit: 5,
          premium_listing_limit: -1,
          business_listing_limit: 1000,
        });
        setMembershipPrices({
          premium_monthly_price: 99,
          premium_yearly_price: 960,
          business_monthly_price: 499,
          business_yearly_price: 4790,
        });
      }
    };
    fetchSettings();
  }, []);

  // Fetch membership details and payment methods for premium/business users
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const fetchMembershipDetails = async () => {
      try {
        // Fetch membership info
        const membershipResponse = await api.get('/membership/me');
        const membership = membershipResponse.data;
        
        if (membership && (membership.tier?.type === 'basic' || membership.tier?.type === 'premium' || membership.tier?.type === 'business')) {
          setMembershipDetails({
            currentPeriodStart: membership.currentPeriodStart,
            currentPeriodEnd: membership.currentPeriodEnd,
            tier: membership.tier?.type,
          });

          // Fetch payment methods
          try {
            const paymentMethodsResponse = await api.get('/payments/methods');
            const methods = paymentMethodsResponse.data?.methods || paymentMethodsResponse.data || [];
            setPaymentMethods(methods);
          } catch (error) {
            if (process.env.NODE_ENV === 'development') console.error('Failed to fetch payment methods:', error);
            setPaymentMethods([]);
          }
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') console.error('Failed to fetch membership details:', error);
      }
    };

    fetchMembershipDetails();
  }, [isAuthenticated, user]);

  const getListingLimitText = (tierId: string) => {
    let limit: number;
    if (tierId === 'free') limit = listingLimits.free_listing_limit ?? 10;
    else if (tierId === 'basic') limit = 50;
    else if (tierId === 'premium') limit = listingLimits.premium_listing_limit ?? 200;
    else limit = listingLimits.business_listing_limit ?? 1000;
    
    if (limit === -1) {
      return `${t('membership.unlimited')} ${t('membership.listingsLimit')}`;
    }
    return `${limit} ${t('membership.listingsLimit')}`;
  };

  // Check if user is a business account
  const isBusinessAccount = user && user.companyName && user.taxId;

  const MEMBERSHIP_TIERS = useMemo(() => {
    const allTiers = [
      {
        id: 'free',
        name: t('membership.free'),
        price: 0,
        period: t('membership.perMonth'),
        description: t('membership.subtitle'),
        features: [
          { text: getListingLimitText('free'), included: true },
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
        id: 'basic',
        name: 'Temel',
        price: 49,
        period: t('membership.perMonth'),
        description: 'Koleksiyoncular için başlangıç',
        features: [
          { text: getListingLimitText('basic'), included: true },
          { text: '6 resim/ilan', included: true },
          { text: t('nav.trades'), included: true },
          { text: t('collection.collections'), included: true },
          { text: t('membership.noAds'), included: false },
          { text: '2 öne çıkan ilan', included: true },
        ],
        popular: false,
        color: 'blue',
      },
      {
        id: 'premium',
        name: t('membership.premium'),
        price: membershipPrices.premium_monthly_price ?? 99,
        period: t('membership.perMonth'),
        description: t('membership.mostPopular'),
        features: [
          { text: getListingLimitText('premium'), included: true },
          { text: '10 resim/ilan', included: true },
          { text: t('nav.trades'), included: true },
          { text: `${t('membership.unlimited')} ${t('collection.collections')}`, included: true },
          { text: t('membership.noAds'), included: true },
          { text: '10 öne çıkan ilan', included: true },
        ],
        popular: true,
        color: 'purple',
      },
      {
        id: 'business',
        name: t('membership.business'),
        price: membershipPrices.business_monthly_price ?? 499,
        period: t('membership.perMonth'),
        description: t('membership.business'),
        features: [
          { text: getListingLimitText('business'), included: true },
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

    // Business hesabı ise sadece business tier göster, değilse free ve premium göster
    // Eğer kullanıcının mevcut üyeliği business ise, sadece business göster
    const currentTierValue = isAuthenticated ? (user?.membershipTier || 'free') : 'free';
    const isCurrentBusinessTier = currentTierValue === 'business';
    
    if (isBusinessAccount || isCurrentBusinessTier) {
      return allTiers.filter(tier => tier.id === 'business');
    } else {
      return allTiers.filter(tier => tier.id !== 'business');
    }
  }, [listingLimits, membershipPrices, t, isBusinessAccount, isAuthenticated, user]);

  useEffect(() => {
    const tier = searchParams?.get('tier');
    if (tier) {
      setSelectedTier(tier);
      setTimeout(() => {
        const element = document.getElementById(`tier-${tier}`);
        element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
    
    // If required=true, automatically select business tier
    const required = searchParams?.get('required');
    if (required === 'true' && isBusinessAccount) {
      setSelectedTier('business');
    }
  }, [searchParams, isBusinessAccount]);

  const currentTier = isAuthenticated ? (user?.membershipTier || 'free') : null;
  const isRequired = searchParams?.get('required') === 'true';

  // Block navigation if business membership is required
  useEffect(() => {
    if (isRequired && isBusinessAccount && currentTier !== 'business') {
      // Prevent navigation away from membership page
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        e.preventDefault();
        e.returnValue = '';
      };

      const handlePopState = () => {
        router.push('/profile/membership?required=true');
      };

      window.addEventListener('beforeunload', handleBeforeUnload);
      window.addEventListener('popstate', handlePopState);

      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
        window.removeEventListener('popstate', handlePopState);
      };
    }
  }, [isRequired, isBusinessAccount, currentTier, router]);

  const handleSelectTier = (tierId: string) => {
    if (tierId === 'free') {
      toast(t('membership.planAlreadyActive'));
      return;
    }
    if (tierId === currentTier) {
      toast(t('membership.planAlreadyActive'));
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
      router.push(`/login?redirect=/profile/membership?tier=${selectedTier}`);
      return;
    }

    // Preserve required parameter if present
    const requiredParam = isRequired ? '&required=true' : '';
    const checkoutUrl = `/membership/checkout?tier=${selectedTier}&period=${selectedPeriod}${requiredParam}`;
    
    // Use window.location for more reliable navigation when required=true
    if (isRequired) {
      window.location.href = checkoutUrl;
    } else {
      router.push(checkoutUrl);
    }
  };

  if (!isAuthenticated) {
    router.push('/login?redirect=/profile/membership');
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {!isRequired && (
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-8"
          >
            <ArrowLeftIcon className="w-5 h-5" />
            {locale === 'en' ? 'Back to Profile' : 'Profile Dön'}
          </Link>
        )}

        {/* Required Business Membership Banner */}
        {isRequired && isBusinessAccount && currentTier !== 'business' && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 bg-amber-50 border-2 border-amber-300 rounded-xl p-6"
          >
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl">💼</span>
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-amber-900 mb-2">
                  Business Üyelik Gerekli
                </h3>
                <p className="text-amber-800 mb-4">
                  Şirket hesabınız için business üyelik almanız gerekmektedir. Üyeliğinizi tamamlamadan başka sayfalara geçemezsiniz.
                </p>
                <div className="flex items-center gap-2 text-sm text-amber-700">
                  <span>⚠️</span>
                  <span>Lütfen aşağıdaki business üyelik planını seçin ve ödeme işlemini tamamlayın.</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        <div className="text-center mb-12">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-4">{t('membership.title')}</h1>
          <p className="text-base sm:text-lg lg:text-xl text-gray-600 max-w-2xl mx-auto">
            {t('membership.subtitle')}
          </p>
          
          {currentTier && currentTier !== 'free' && (
            <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4 max-w-md mx-auto">
              <p className="text-blue-800 font-medium">
                {t('membership.currentPlan')}: {MEMBERSHIP_TIERS.find(tier => tier.id === currentTier)?.name || t('membership.free')}
              </p>
            </div>
          )}
        </div>

        {/* Membership Details Card for Premium/Business Users */}
        {membershipDetails && (membershipDetails.tier === 'premium' || membershipDetails.tier === 'business') && (
          <div className="max-w-4xl mx-auto mb-12 bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Mevcut Üyelik Bilgileri</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <CalendarIcon className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Üyelik Başlangıç Tarihi</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {membershipDetails.currentPeriodStart 
                      ? new Date(membershipDetails.currentPeriodStart).toLocaleDateString('tr-TR', { 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        })
                      : '-'}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="p-3 bg-green-100 rounded-lg">
                  <CalendarIcon className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Yenilenme Tarihi</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {membershipDetails.currentPeriodEnd 
                      ? new Date(membershipDetails.currentPeriodEnd).toLocaleDateString('tr-TR', { 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        })
                      : '-'}
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-200 pt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <CreditCardIcon className="w-5 h-5" />
                  Kayıtlı Kartlar
                </h3>
                <Link
                  href="/profile/payments"
                  className="text-sm text-primary-500 hover:text-primary-600 font-medium"
                >
                  Kart Yönetimi
                </Link>
              </div>
              
              {paymentMethods.length > 0 ? (
                <div className="space-y-3">
                  {paymentMethods.map((method) => (
                    <div
                      key={method.id}
                      className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                          <CreditCardIcon className="w-6 h-6 text-primary-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">
                            {method.cardBrand} •••• {method.lastFour}
                          </p>
                          <p className="text-sm text-gray-500">
                            Son kullanma: {String(method.expiryMonth).padStart(2, '0')}/{method.expiryYear}
                          </p>
                        </div>
                      </div>
                      {method.isDefault && (
                        <span className="px-3 py-1 bg-primary-100 text-primary-700 text-xs font-medium rounded-full">
                          Varsayılan
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 bg-amber-50 border border-amber-200 rounded-lg text-center">
                  <p className="text-amber-800 font-medium mb-2">Henüz kayıtlı kartınız yok</p>
                  <p className="text-sm text-amber-700 mb-4">
                    Üyeliğinizin otomatik yenilenmesi için bir kart eklemeniz gerekmektedir.
                  </p>
                  <Link
                    href="/profile/payments"
                    className="inline-block px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm font-medium"
                  >
                    Kart Ekle
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}

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
          <div className={`grid gap-6 max-w-4xl ${
            MEMBERSHIP_TIERS.length === 1 
              ? 'grid-cols-1 max-w-md' 
              : 'grid-cols-1 md:grid-cols-2'
          }`}>
          {MEMBERSHIP_TIERS.map((tier, index) => {
            let displayPrice = tier.price;
            if (selectedPeriod === 'yearly' && tier.price > 0) {
              const discountPercentage = membershipPrices.yearly_discount_percentage ?? 20;
              if (tier.id === 'premium' && membershipPrices.premium_yearly_price) {
                displayPrice = membershipPrices.premium_yearly_price;
              } else if (tier.id === 'business' && membershipPrices.business_yearly_price) {
                displayPrice = membershipPrices.business_yearly_price;
              } else {
                // Fallback: calculate from monthly price with discount percentage
                displayPrice = Math.round(tier.price * 12 * (1 - discountPercentage / 100) * 100) / 100;
              }
            }
            
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
                  if (tier.price === 0) {
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
                        {tier.id === 'premium' && membershipPrices.premium_monthly_price && (
                          <span className="text-xs text-gray-400 ml-1">
                            (Normal: {membershipPrices.premium_monthly_price.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL)
                          </span>
                        )}
                        {tier.id === 'business' && membershipPrices.business_monthly_price && (
                          <span className="text-xs text-gray-400 ml-1">
                            (Normal: {membershipPrices.business_monthly_price.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL)
                          </span>
                        )}
                        {membershipPrices.yearly_discount_percentage && (
                          <span className="text-xs text-green-500 ml-1">
                            (%{membershipPrices.yearly_discount_percentage} indirim)
                          </span>
                        )}
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
                      : tier.price === 0
                      ? 'bg-gray-100 text-gray-400'
                      : 'bg-gray-100 text-gray-700 group-hover:bg-gray-200'
                  }`}>
                    {isCurrent ? t('membership.currentPlan') : tier.price === 0 ? t('membership.free') : isSelected ? t('common.selected') : t('common.select')}
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
              {t('common.continue')}
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

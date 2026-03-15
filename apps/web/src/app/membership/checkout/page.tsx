'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  CheckIcon,
  CreditCardIcon,
  ShieldCheckIcon,
  ArrowLeftIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import { membershipApi, api } from '@/lib/api';

const TIER_FEATURES: Record<string, string[]> = {
  basic: [
    '50 ilan limiti',
    '6 resim/ilan',
    'Takas yapma',
    'Koleksiyonlar',
    '2 öne çıkan ilan',
  ],
  premium: [
    'Sınırsız aktif ilan',
    '15 resim/ilan',
    'Takas yapma',
    'Sınırsız koleksiyon (Digital Garage)',
    'Reklamsız deneyim',
    '3 öne çıkan ilan',
  ],
  business: [
    '1000 aktif ilan hakkı',
    'Takas yapma',
    'Sınırsız koleksiyon',
    'Reklamsız deneyim',
    '7/24 öncelikli destek',
    'Özel API erişimi',
  ],
};

export default function MembershipCheckoutPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, user, refreshUserData } = useAuthStore();
  
  const tier = searchParams.get('tier') || 'premium';
  const period = (searchParams.get('period') || 'monthly') as 'monthly' | 'yearly';
  const required = searchParams.get('required') === 'true';
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'bank'>('card');
  const [cardData, setCardData] = useState({
    number: '',
    name: '',
    expiry: '',
    cvv: '',
  });
  const [agreed, setAgreed] = useState(false);
  const [membershipPrices, setMembershipPrices] = useState<{
    basic_monthly_price?: number;
    basic_yearly_price?: number;
    premium_monthly_price?: number;
    premium_yearly_price?: number;
    business_monthly_price?: number;
    business_yearly_price?: number;
    yearly_discount_percentage?: number;
  }>({});

  // Fetch membership prices from API
  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const response = await api.get('/admin/settings/public');
        const settings = response.data || {};
        
        // Validate and sanitize prices - if price seems too high, it might be in wrong unit
        const sanitizePrice = (price: number | undefined, defaultPrice: number): number => {
          if (!price || isNaN(price)) return defaultPrice;
          // If price is suspiciously high (> 10000), it might be in wrong unit (kuruş instead of TL)
          // Check if dividing by 100 makes it reasonable
          if (price > 10000) {
            const priceInTL = price / 100;
            // If divided price is reasonable (between 1 and 10000), use it
            if (priceInTL >= 1 && priceInTL <= 10000) {
              return Math.round(priceInTL * 100) / 100;
            }
          }
          // If price is reasonable, use it as is
          if (price >= 1 && price <= 10000) {
            return price;
          }
          // Otherwise, use default
          return defaultPrice;
        };
        
        setMembershipPrices({
          basic_monthly_price: sanitizePrice(settings.basic_monthly_price, 49),
          basic_yearly_price: sanitizePrice(settings.basic_yearly_price, 490),
          premium_monthly_price: sanitizePrice(settings.premium_monthly_price, 99),
          premium_yearly_price: sanitizePrice(settings.premium_yearly_price, 960),
          business_monthly_price: sanitizePrice(settings.business_monthly_price, 499),
          business_yearly_price: sanitizePrice(settings.business_yearly_price, 4790),
          yearly_discount_percentage: settings.yearly_discount_percentage ?? 20,
        });
      } catch (error) {
        if (process.env.NODE_ENV === 'development') console.error('Failed to fetch prices:', error);
        setMembershipPrices({
          basic_monthly_price: 49,
          basic_yearly_price: 490,
          premium_monthly_price: 99,
          premium_yearly_price: 960,
          business_monthly_price: 499,
          business_yearly_price: 4790,
          yearly_discount_percentage: 20,
        });
      }
    };
    fetchPrices();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push(`/login?redirect=/membership/checkout?tier=${tier}&period=${period}`);
    }
  }, [isAuthenticated, tier, period, router]);

  // Get tier info dynamically
  const getTierInfo = () => {
    const tierNames: Record<string, string> = {
      basic: 'Temel Üyelik',
      premium: 'Premium Üyelik',
      business: 'İş Üyeliği',
    };
    
    let basePrice: number;
    if (tier === 'basic') {
      basePrice = period === 'monthly'
        ? (membershipPrices.basic_monthly_price ?? 49)
        : (membershipPrices.basic_yearly_price ?? 490);
    } else if (tier === 'premium') {
      basePrice = period === 'monthly' 
        ? (membershipPrices.premium_monthly_price ?? 99)
        : (membershipPrices.premium_yearly_price ?? 960);
    } else if (tier === 'business') {
      basePrice = period === 'monthly'
        ? (membershipPrices.business_monthly_price ?? 499)
        : (membershipPrices.business_yearly_price ?? 4790);
    } else {
      return null;
    }

    return {
      name: tierNames[tier],
      price: basePrice,
      features: TIER_FEATURES[tier] || [],
      basePrice: period === 'monthly' ? basePrice : (tier === 'basic' ? (membershipPrices.basic_monthly_price ?? 49) : tier === 'premium' ? (membershipPrices.premium_monthly_price ?? 99) : (membershipPrices.business_monthly_price ?? 499)),
    };
  };

  const tierInfo = getTierInfo();
  
  if (!tierInfo || !['basic', 'premium', 'business'].includes(tier)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Geçersiz üyelik planı</p>
          <Link href={required ? '/profile/membership?required=true' : '/profile/membership'} className="text-primary-500 hover:underline">
            Planlara Dön
          </Link>
        </div>
      </div>
    );
  }

  const finalPrice = tierInfo.price;
  const basePrice = tierInfo.basePrice;
  const monthlyPrice = period === 'yearly' ? Math.round(finalPrice / 12) : finalPrice;

  // Validate price - if it's too high, show warning
  useEffect(() => {
    if (finalPrice > 100000) {
      toast.error(
        `Fiyat çok yüksek görünüyor (${finalPrice.toLocaleString('tr-TR')} TL). Lütfen admin panelinden membership fiyatlarını kontrol edin.`,
        { duration: 10000 }
      );
    }
  }, [finalPrice]);

  const formatCardNumber = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    const groups = cleaned.match(/.{1,4}/g);
    return groups ? groups.join(' ').slice(0, 19) : '';
  };

  const formatExpiry = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length >= 2) {
      return `${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}`;
    }
    return cleaned;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!agreed) {
      toast.error('Lütfen kullanım koşullarını kabul edin');
      return;
    }

    if (paymentMethod === 'card') {
      if (!cardData.number || !cardData.name || !cardData.expiry || !cardData.cvv) {
        toast.error('Lütfen tüm kart bilgilerini doldurun');
        return;
      }
    }

    setIsProcessing(true);
    
    try {
      // Call the membership subscription API - this will create membership and initiate payment
      const response = await membershipApi.subscribe({
        tierType: tier,
        billingPeriod: period,
      });
      
      const paymentUrl = response.data.paymentUrl || (response.data as any).paymentUrl;
      const paymentId = response.data.paymentId || (response.data as any).paymentId;
      
      if (paymentUrl) {
        // Redirect to Iyzico payment page
        if (paymentUrl.startsWith('http')) {
          window.location.href = paymentUrl;
          return;
        }
        // If payment HTML is provided, show it
        if ((response.data as any).paymentHtml) {
          // For Iyzico, paymentUrl should be a redirect URL
          window.location.href = paymentUrl;
          return;
        }
      } else if (paymentId) {
        // Redirect to payment page (type=membership so success shows membership page, not order)
        router.push(`/payment/${paymentId}?type=membership`);
        return;
      } else {
        // No payment needed (free tier)
        toast.success('Üyeliğiniz başarıyla yükseltildi!');
        await refreshUserData();
        router.push('/membership/success?tier=' + tier);
      }
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') console.error('Payment error:', error);
      toast.error(error.response?.data?.message || 'Ödeme işlemi başarısız oldu');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link 
            href={required ? '/profile/membership?required=true' : '/profile/membership'} 
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <ArrowLeftIcon className="w-6 h-6 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Üyelik Yükseltme</h1>
            <p className="text-sm text-gray-500">Güvenli ödeme ile üyeliğinizi yükseltin</p>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Payment Form */}
          <div className="lg:col-span-2">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Payment Method */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Ödeme Yöntemi</h2>
                
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('card')}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      paymentMethod === 'card'
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <CreditCardIcon className="w-8 h-8 mx-auto mb-2 text-gray-600" />
                    <p className="font-medium text-gray-900">Kredi/Banka Kartı</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('bank')}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      paymentMethod === 'bank'
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <svg className="w-8 h-8 mx-auto mb-2 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    <p className="font-medium text-gray-900">Havale/EFT</p>
                  </button>
                </div>

                {paymentMethod === 'card' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Kart Numarası
                      </label>
                      <input
                        type="text"
                        value={cardData.number}
                        onChange={(e) => setCardData({ ...cardData, number: formatCardNumber(e.target.value) })}
                        placeholder="0000 0000 0000 0000"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        maxLength={19}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Kart Üzerindeki İsim
                      </label>
                      <input
                        type="text"
                        value={cardData.name}
                        onChange={(e) => setCardData({ ...cardData, name: e.target.value.toUpperCase() })}
                        placeholder="AD SOYAD"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Son Kullanma Tarihi
                        </label>
                        <input
                          type="text"
                          value={cardData.expiry}
                          onChange={(e) => setCardData({ ...cardData, expiry: formatExpiry(e.target.value) })}
                          placeholder="AA/YY"
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                          maxLength={5}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          CVV
                        </label>
                        <input
                          type="text"
                          value={cardData.cvv}
                          onChange={(e) => setCardData({ ...cardData, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                          placeholder="000"
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                          maxLength={4}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {paymentMethod === 'bank' && (
                  <div className="bg-gray-50 rounded-xl p-6">
                    <h3 className="font-semibold text-gray-900 mb-4">Havale/EFT Bilgileri</h3>
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Banka:</span>
                        <span className="font-medium">Ziraat Bankası</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Şube:</span>
                        <span className="font-medium">İstanbul / Kadıköy</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Hesap Adı:</span>
                        <span className="font-medium">Tarodan Teknoloji A.Ş.</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">IBAN:</span>
                        <span className="font-mono font-medium">TR00 0000 0000 0000 0000 0000 00</span>
                      </div>
                    </div>
                    <p className="text-sm text-amber-600 mt-4">
                      ⚠️ Havale açıklamasına kullanıcı adınızı ({user?.displayName}) yazmayı unutmayın.
                    </p>
                  </div>
                )}
              </div>

              {/* Terms */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="w-5 h-5 mt-0.5 text-primary-500 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-600">
                    <Link href="/terms" className="text-primary-500 hover:underline">Kullanım koşullarını</Link> ve{' '}
                    <Link href="/privacy" className="text-primary-500 hover:underline">gizlilik politikasını</Link> okudum, kabul ediyorum.
                    Üyeliğimin {period === 'yearly' ? 'yıllık' : 'aylık'} olarak otomatik yenileneceğini anlıyorum.
                  </span>
                </label>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isProcessing}
                className="w-full py-4 bg-primary-500 text-white text-lg font-semibold rounded-xl hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                    İşleniyor...
                  </>
                ) : (
                  <>
                    <ShieldCheckIcon className="w-5 h-5" />
                    {finalPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL Öde
                  </>
                )}
              </button>

              {/* Security Note */}
              <p className="text-center text-sm text-gray-500 flex items-center justify-center gap-2">
                <ShieldCheckIcon className="w-4 h-4" />
                256-bit SSL ile güvenli ödeme
              </p>
            </form>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm p-6 sticky top-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Sipariş Özeti</h2>
              
              <div className="border-b border-gray-200 pb-4 mb-4">
                <h3 className="font-semibold text-gray-900">{tierInfo.name}</h3>
                <p className="text-sm text-gray-500">
                  {period === 'yearly' ? 'Yıllık plan' : 'Aylık plan'}
                </p>
              </div>

              <ul className="space-y-2 mb-6">
                {tierInfo.features.map((feature, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-sm text-gray-600">
                    <CheckIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>

              <div className="border-t border-gray-200 pt-4 space-y-2">
                {period === 'yearly' && (
                  <>
                    <div className="flex justify-between text-sm text-gray-500">
                      <span>Normal fiyat</span>
                      <span className="line-through">{(basePrice * 12).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL</span>
                    </div>
                    <div className="flex justify-between text-sm text-green-600">
                      <span>İndirim (%{membershipPrices.yearly_discount_percentage ?? 20})</span>
                      <span>-{(basePrice * 12 - finalPrice).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between text-lg font-semibold">
                  <span>Toplam</span>
                  <span className="text-primary-500">{finalPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL</span>
                </div>
                {period === 'yearly' && (
                  <p className="text-xs text-gray-500 text-right">
                    Ayda {monthlyPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

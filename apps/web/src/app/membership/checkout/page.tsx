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
import { Button, Checkbox, Spinner } from '@tarodan/ui';
import { useAuthStore } from '@/stores/authStore';
import AuthLoadingScreen from '@/components/AuthLoadingScreen';
import { membershipApi, api, paymentsApi } from '@/lib/api';

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
  const { isAuthenticated, isLoading: authLoading, user, refreshUserData } = useAuthStore();
  
  const tier = searchParams.get('tier') || 'premium';
  const period = (searchParams.get('period') || 'monthly') as 'monthly' | 'yearly';
  const required = searchParams.get('required') === 'true';
  
  const [isProcessing, setIsProcessing] = useState(false);
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
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push(`/login?redirect=/membership/checkout?tier=${tier}&period=${period}`);
    }
  }, [authLoading, isAuthenticated, tier, period, router]);

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

  useEffect(() => {
    if (tierInfo && tierInfo.price > 100000) {
      toast.error(
        `Fiyat çok yüksek görünüyor (${tierInfo.price.toLocaleString('tr-TR')} TL). Lütfen admin panelinden membership fiyatlarını kontrol edin.`,
        { duration: 10000 }
      );
    }
  }, [tierInfo]);

  if (!tierInfo || !['basic', 'premium', 'business'].includes(tier)) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted mb-4">Geçersiz üyelik planı</p>
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!agreed) {
      toast.error('Lütfen kullanım koşullarını kabul edin');
      return;
    }

    setIsProcessing(true);

    try {
      // 1) Üyeliği hazırla + ödeme kaydını oluştur (orderId döner)
      const response = await membershipApi.subscribe({
        tierType: tier,
        billingPeriod: period,
      });

      const data: any = response.data;
      const paymentId = data.paymentId;
      const orderId = data.orderId;

      // Test bypass ortamı: PayTR'ye gitmeden tamamla
      if (data.useBypass === true && paymentId) {
        await paymentsApi.bypassComplete(paymentId).catch(() => {});
        toast.success('Üyeliğiniz aktifleştirildi!');
        await refreshUserData();
        router.push('/membership/success?tier=' + tier);
        return;
      }

      // 2) Tek ödeme yüzeyi: site-içi kart formu için ödeme sayfamıza git (3D Secure orada).
      if (orderId) {
        const init = await paymentsApi.initiate(orderId, 'paytr');
        const initData: any = init.data?.data ?? init.data ?? {};
        if (initData.paymentId) {
          router.push(`/payment/${initData.paymentId}?type=membership`);
          return;
        }
      }

      // Yedek: subscribe yanıtında doğrudan paymentId döndüyse
      if (paymentId) {
        router.push(`/payment/${paymentId}?type=membership`);
        return;
      }
      toast.success('Üyeliğiniz başarıyla yükseltildi!');
      await refreshUserData();
      router.push('/membership/success?tier=' + tier);
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') console.error('Payment error:', error);
      toast.error(error.response?.data?.message || 'Ödeme işlemi başarısız oldu. Lütfen tekrar deneyin.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (authLoading) {
    return <AuthLoadingScreen />;
  }
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <Spinner size="xl" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link 
            href={required ? '/profile/membership?required=true' : '/profile/membership'} 
            className="p-2 hover:bg-border-subtle rounded-lg transition-colors"
          >
            <ArrowLeftIcon className="w-6 h-6 text-muted" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-heading">Üyelik Yükseltme</h1>
            <p className="text-sm text-muted">Güvenli ödeme ile üyeliğinizi yükseltin</p>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Payment Form */}
          <div className="lg:col-span-2">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Payment Info */}
              <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-heading mb-2 flex items-center gap-2">
                  <CreditCardIcon className="w-5 h-5 text-primary-500" />
                  Güvenli Ödeme
                </h2>
                <p className="text-sm text-muted">
                  Onayladıktan sonra güvenli ödeme sayfamızda kart bilgilerinizi girip
                  3D Secure ile ödersiniz. Kart bilgileriniz saklanmaz; PayTR altyapısıyla işlenir.
                </p>
              </div>

              {/* Terms */}
              <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
                <label className="flex items-start gap-3 cursor-pointer">
                  <Checkbox
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-0.5 h-5 w-5"
                  />
                  <span className="text-sm text-muted">
                    <Link href="/terms" className="text-primary-500 hover:underline">Kullanım koşullarını</Link> ve{' '}
                    <Link href="/privacy" className="text-primary-500 hover:underline">gizlilik politikasını</Link> okudum, kabul ediyorum.
                    Üyeliğimin {period === 'yearly' ? 'yıllık' : 'aylık'} olarak otomatik yenileneceğini anlıyorum.
                  </span>
                </label>
              </div>

              {/* Submit */}
              <Button variant="secondary" type="submit"
                disabled={isProcessing}
                className="w-full py-4 bg-primary-500 text-inverted text-lg font-semibold rounded-xl hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                {isProcessing ? (
                  <>
                    <Spinner size="sm" color="border-surface-elevated border-t-transparent" />
                    İşleniyor...
                  </>
                ) : (
                  <>
                    <ShieldCheckIcon className="w-5 h-5" />
                    {finalPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL Öde
                  </>
                )}
              </Button>

              {/* Security Note */}
              <p className="text-center text-sm text-muted flex items-center justify-center gap-2">
                <ShieldCheckIcon className="w-4 h-4" />
                256-bit SSL ile güvenli ödeme
              </p>
            </form>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className="bg-surface-elevated rounded-xl shadow-sm p-6 sticky top-8">
              <h2 className="text-lg font-semibold text-heading mb-4">Sipariş Özeti</h2>
              
              <div className="border-b border-border pb-4 mb-4">
                <h3 className="font-semibold text-heading">{tierInfo.name}</h3>
                <p className="text-sm text-muted">
                  {period === 'yearly' ? 'Yıllık plan' : 'Aylık plan'}
                </p>
              </div>

              <ul className="space-y-2 mb-6">
                {tierInfo.features.map((feature, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-sm text-muted">
                    <CheckIcon className="w-4 h-4 text-success-500 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>

              <div className="border-t border-border pt-4 space-y-2">
                {period === 'yearly' && (
                  <>
                    <div className="flex justify-between text-sm text-muted">
                      <span>Normal fiyat</span>
                      <span className="line-through">{(basePrice * 12).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL</span>
                    </div>
                    <div className="flex justify-between text-sm text-success-600">
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
                  <p className="text-xs text-muted text-right">
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

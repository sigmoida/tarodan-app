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
import { tierChangeKind } from '@/lib/membershipTiers';

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
  // Mevcut tier (taze /membership/me) — yükseltme/düşürme/değiştirme mesajını seçmek için.
  const [currentTier, setCurrentTier] = useState<string>(user?.membershipTier ?? 'free');
  // TEK FİYAT KAYNAĞI: DB MembershipTier (backend ödemede tam bunu çeker). Eski
  // /admin/settings/public + hardcoded fallback'ler UI ile çekilen tutarı
  // uyumsuzlaştırıyordu (UI 500, backend 250). getTiers ile birebir aynı.
  const [tierPrices, setTierPrices] = useState<{ monthlyPrice: number; yearlyPrice: number } | null>(null);
  const [tiersLoading, setTiersLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    membershipApi.getTiers()
      .then((r) => {
        if (cancelled) return;
        const list: any[] = r.data?.data ?? r.data ?? [];
        const t = list.find((x) => x.type === tier);
        if (t) setTierPrices({ monthlyPrice: Number(t.monthlyPrice), yearlyPrice: Number(t.yearlyPrice) });
      })
      .catch((e) => { if (process.env.NODE_ENV === 'development') console.error('Failed to fetch tiers:', e); })
      .finally(() => { if (!cancelled) setTiersLoading(false); });
    return () => { cancelled = true; };
  }, [tier]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push(`/login?redirect=/membership/checkout?tier=${tier}&period=${period}`);
    }
  }, [authLoading, isAuthenticated, tier, period, router]);

  // Mevcut tier'ı taze çek (mesaj yön kararı için).
  useEffect(() => {
    if (!isAuthenticated) return;
    api.get('/membership/me')
      .then((r) => { if (r.data?.tier?.type) setCurrentTier(r.data.tier.type); })
      .catch(() => { /* fallback: user.membershipTier */ });
  }, [isAuthenticated]);

  // Yükseltme/düşürme/değiştirme toast mesajı.
  const changeSuccessMessage = (): string => {
    const kind = tierChangeKind(currentTier, tier);
    if (kind === 'upgrade') return 'Üyeliğiniz başarıyla yükseltildi!';
    return 'Üyeliğiniz başarıyla değiştirildi!';
  };

  // Get tier info dynamically — fiyat tek kaynak: DB tier (tierPrices).
  const getTierInfo = () => {
    const tierNames: Record<string, string> = {
      basic: 'Temel Üyelik',
      premium: 'Premium Üyelik',
      business: 'İş Üyeliği',
    };
    if (!['basic', 'premium', 'business'].includes(tier) || !tierPrices) {
      return null;
    }
    // Seçilen döneme göre ödenecek tutar (backend ödemede tam bunu çeker).
    const price = period === 'monthly' ? tierPrices.monthlyPrice : tierPrices.yearlyPrice;
    return {
      name: tierNames[tier],
      price,
      features: TIER_FEATURES[tier] || [],
      // Aylık referans fiyat (yıllıkta "normal" karşılaştırması için).
      basePrice: tierPrices.monthlyPrice,
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

  // Fiyatlar yüklenirken (geçerli tier) bekleme göster — "geçersiz plan" deme.
  if (tiersLoading && ['basic', 'premium', 'business'].includes(tier)) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <Spinner size="xl" />
      </div>
    );
  }

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

      const kind = tierChangeKind(currentTier, tier);

      // Test bypass ortamı: PayTR'ye gitmeden tamamla
      if (data.useBypass === true && paymentId) {
        await paymentsApi.bypassComplete(paymentId).catch(() => {});
        toast.success(changeSuccessMessage());
        await refreshUserData();
        router.push(`/membership/success?tier=${tier}&kind=${kind}`);
        return;
      }

      // 2) Tek ödeme yüzeyi: site-içi kart formu için ödeme sayfamıza git (3D Secure orada).
      if (orderId) {
        const init = await paymentsApi.initiate(orderId, 'paytr');
        const initData: any = init.data?.data ?? init.data ?? {};
        if (initData.paymentId) {
          router.push(`/payment/${initData.paymentId}?type=membership&kind=${kind}`);
          return;
        }
      }

      // Yedek: subscribe yanıtında doğrudan paymentId döndüyse
      if (paymentId) {
        router.push(`/payment/${paymentId}?type=membership&kind=${kind}`);
        return;
      }

      // Ertelemeli downgrade: backend tier'ı HEMEN değiştirmez (scheduledTierType döner),
      // ödeme istemez. Mevcut (yüksek) plan dönem sonuna kadar sürer. "Tebrikler, yeni
      // üyelik" demek yanıltıcı olur; kullanıcıya geçişin ileri tarihli olduğunu anlat.
      if (data.scheduledTierType) {
        await refreshUserData();
        router.push(`/membership/success?tier=${tier}&kind=downgrade&scheduled=1`);
        return;
      }

      toast.success(changeSuccessMessage());
      await refreshUserData();
      router.push(`/membership/success?tier=${tier}&kind=${kind}`);
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
                      <span>İndirim (%{basePrice * 12 > 0 ? Math.round((1 - finalPrice / (basePrice * 12)) * 100) : 0})</span>
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

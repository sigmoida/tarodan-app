'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  CheckIcon,
  XMarkIcon,
  StarIcon,
  ArrowLeftIcon,
} from '@heroicons/react/24/solid';
import { CalendarIcon } from '@heroicons/react/24/outline';
import { useAuthStore } from '@/stores/authStore';
import AuthLoadingScreen from '@/components/AuthLoadingScreen';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { api, membershipApi } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmProvider';
import { useTranslation } from '@/i18n';
import { Button } from '@tarodan/ui';

export default function MembershipPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t, locale } = useTranslation();
  const confirm = useConfirm();
  const { isAuthenticated, isLoading: authLoading, user } = useAuthStore();
  const [selectedPeriod, setSelectedPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [listingLimits, setListingLimits] = useState<{
    free_listing_limit?: number;
    basic_listing_limit?: number;
    premium_listing_limit?: number;
    business_listing_limit?: number;
  }>({});
  const [membershipPrices, setMembershipPrices] = useState<{
    basic_monthly_price?: number;
    basic_yearly_price?: number;
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
    status?: string;
    cancelledAt?: string;
    pendingPayment?: boolean;
    pendingTierName?: string;
    pendingTierType?: string;
    autoRenew?: boolean;
  } | null>(null);
  const [autoRenewSaving, setAutoRenewSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Fiyat ve limitler TEK KAYNAKTAN: DB MembershipTier (checkout + backend ödeme
  // ile birebir aynı). Eskiden /admin/settings/public + hardcoded fallback'ler
  // checkout ile uyumsuz fiyat gösteriyordu (UI 500 / charge 250).
  useEffect(() => {
    const fetchTierData = async () => {
      try {
        const r = await membershipApi.getTiers();
        const list: any[] = r.data?.data ?? r.data ?? [];
        const by = (type: string) => list.find((x) => x.type === type);
        const free = by('free'), basic = by('basic'), premium = by('premium'), business = by('business');
        // yıllık indirim % — tier fiyatlarından türet (monthly*12 vs yearly).
        const pct = (m?: number, y?: number) =>
          m && y && m * 12 > 0 ? Math.round((1 - y / (m * 12)) * 100) : undefined;
        setListingLimits({
          free_listing_limit: free?.maxTotalListings,
          basic_listing_limit: basic?.maxTotalListings,
          premium_listing_limit: premium?.maxTotalListings,
          business_listing_limit: business?.maxTotalListings,
        });
        setMembershipPrices({
          basic_monthly_price: basic ? Number(basic.monthlyPrice) : undefined,
          basic_yearly_price: basic ? Number(basic.yearlyPrice) : undefined,
          premium_monthly_price: premium ? Number(premium.monthlyPrice) : undefined,
          premium_yearly_price: premium ? Number(premium.yearlyPrice) : undefined,
          business_monthly_price: business ? Number(business.monthlyPrice) : undefined,
          business_yearly_price: business ? Number(business.yearlyPrice) : undefined,
          yearly_discount_percentage:
            pct(premium ? Number(premium.monthlyPrice) : undefined, premium ? Number(premium.yearlyPrice) : undefined) ?? 20,
        });
      } catch (error) {
        if (process.env.NODE_ENV === 'development') console.error('Failed to fetch tiers:', error);
        // Tier'lar çekilemezse boş bırak — getListingLimitText/MEMBERSHIP_TIERS
        // kendi ?? fallback'lerini kullanır.
      }
    };
    fetchTierData();
  }, []);

  // Fetch membership details and payment methods for premium/business users
  // Üyelik bilgilerini /membership/me'den çek (gerçek/güncel kaynak). Hem ilk
  // yüklemede hem iptal sonrası yeniden çağrılır.
  const fetchMembershipDetails = useCallback(async () => {
    try {
      const membershipResponse = await api.get('/membership/me');
      const membership = membershipResponse.data;
      if (membership) {
        const pendingPayment = !!membership.pendingPayment;
        setMembershipDetails({
          currentPeriodStart: membership.currentPeriodStart,
          currentPeriodEnd: membership.currentPeriodEnd,
          tier: membership.tier?.type,
          status: membership.status,
          cancelledAt: membership.cancelledAt,
          pendingPayment: pendingPayment || undefined,
          pendingTierName: membership.pendingTierName,
          pendingTierType: membership.pendingTierType,
          autoRenew: membership.autoRenew,
        });
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Failed to fetch membership details:', error);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    fetchMembershipDetails();
  }, [isAuthenticated, user, fetchMembershipDetails]);

  const getListingLimitText = (tierId: string) => {
    let limit: number;
    if (tierId === 'free') limit = listingLimits.free_listing_limit ?? 10;
    else if (tierId === 'basic') limit = listingLimits.basic_listing_limit ?? 50;
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
        price: membershipPrices.basic_monthly_price ?? 49,
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
    // Gerçek tier: önce taze /membership/me (membershipDetails.tier), yoksa
    // bayat olabilen authStore user.membershipTier'a düş.
    const currentTierValue = isAuthenticated
      ? (membershipDetails?.tier ?? user?.membershipTier ?? 'free')
      : 'free';
    const isCurrentBusinessTier = currentTierValue === 'business';
    
    if (isBusinessAccount || isCurrentBusinessTier) {
      return allTiers.filter(tier => tier.id === 'business');
    } else {
      return allTiers.filter(tier => tier.id !== 'business');
    }
  }, [listingLimits, membershipPrices, t, isBusinessAccount, isAuthenticated, user, membershipDetails]);

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

  const currentTier = isAuthenticated
    ? (membershipDetails?.tier ?? user?.membershipTier ?? 'free')
    : null;
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

  const handleToggleAutoRenew = async () => {
    const next = !(membershipDetails?.autoRenew ?? false);
    setAutoRenewSaving(true);
    setMembershipDetails((d) => (d ? { ...d, autoRenew: next } : d));
    try {
      await api.patch('/membership/auto-renew', { autoRenew: next });
      toast.success(next ? 'Otomatik yenileme hatırlatması açık' : 'Otomatik yenileme hatırlatması kapalı');
    } catch {
      setMembershipDetails((d) => (d ? { ...d, autoRenew: !next } : d));
      toast.error('İşlem başarısız');
    } finally {
      setAutoRenewSaving(false);
    }
  };

  const handleCancelMembership = async () => {
    if (
      !(await confirm({
        title: locale === 'en' ? 'Cancel membership' : 'Üyeliği iptal et',
        description:
          locale === 'en'
            ? 'Are you sure you want to cancel your membership? You can keep using your features until the end of the current period.'
            : 'Üyeliğinizi iptal etmek istediğinizden emin misiniz? Mevcut dönem sonuna kadar özelliklerinizi kullanmaya devam edebilirsiniz.',
        confirmLabel: locale === 'en' ? 'Yes, cancel' : 'Evet, iptal et',
        cancelLabel: locale === 'en' ? 'No' : 'Vazgeç',
        destructive: true,
      }))
    ) {
      return;
    }
    setCancelling(true);
    try {
      await api.post('/membership/cancel');
      toast.success(t('membership.cancelRequested'));
      await fetchMembershipDetails();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'İptal işlemi başarısız');
    } finally {
      setCancelling(false);
    }
  };

  const handleSelectTier = (tierId: string) => {
    // Mevcut tier'a tıklama → zaten aktif.
    if (tierId === currentTier) {
      toast(t('membership.planAlreadyActive'));
      return;
    }
    // Paralı üyelikten free'ye geçiş = iptal (dönem sonuna kadar aktif, iade yok).
    if (tierId === 'free') {
      if (currentTier && currentTier !== 'free') {
        handleCancelMembership();
      } else {
        toast(t('membership.planAlreadyActive'));
      }
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

  if (authLoading) {
    return <AuthLoadingScreen />;
  }
  if (!isAuthenticated) {
    router.push('/login?redirect=/profile/membership');
    return null;
  }

  return (
    <div className="min-h-screen bg-surface">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {!isRequired && (
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 text-muted hover:text-heading mb-8"
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
            className="mb-8 bg-warning-50 border-2 border-warning-300 rounded-xl p-6"
          >
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-warning-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl">💼</span>
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-warning-900 mb-2">
                  Business Üyelik Gerekli
                </h3>
                <p className="text-warning-800 mb-4">
                  Şirket hesabınız için business üyelik almanız gerekmektedir. Üyeliğinizi tamamlamadan başka sayfalara geçemezsiniz.
                </p>
                <div className="flex items-center gap-2 text-sm text-warning-700">
                  <span>⚠️</span>
                  <span>Lütfen aşağıdaki business üyelik planını seçin ve ödeme işlemini tamamlayın.</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        <div className="text-center mb-12">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-heading mb-4">{t('membership.title')}</h1>
          <p className="text-base sm:text-lg lg:text-xl text-muted max-w-2xl mx-auto">
            {t('membership.subtitle')}
          </p>
          
          {membershipDetails?.pendingPayment && membershipDetails?.pendingTierName && (
            <div className="mt-6 bg-warning-50 border border-warning-200 rounded-xl p-4 max-w-md mx-auto">
              <p className="text-warning-800 font-medium mb-2">Ödeme bekleniyor – {membershipDetails.pendingTierName} planı için ödemeyi tamamlayın.</p>
              <Link href={`/membership/checkout?tier=${membershipDetails.pendingTierType || 'premium'}&period=monthly`} className="text-sm font-medium text-warning-700 underline">Ödemeyi tamamla</Link>
            </div>
          )}
          
          {!membershipDetails?.pendingPayment && membershipDetails?.status !== 'cancelled' && currentTier && currentTier !== 'free' && (
            <div className="mt-6 bg-info-50 border border-info-200 rounded-xl p-4 max-w-md mx-auto">
              <p className="text-info-800 font-medium">
                {t('membership.currentPlan')}: {MEMBERSHIP_TIERS.find(tier => tier.id === currentTier)?.name || t('membership.free')}
              </p>
            </div>
          )}

          {/* İptal edildi ama dönem sürüyor: kullanıcı hâlâ premium, dönem sonunda free'ye düşer */}
          {!membershipDetails?.pendingPayment && membershipDetails?.status === 'cancelled' && currentTier && currentTier !== 'free' && (
            <div className="mt-6 bg-warning-50 border border-warning-200 rounded-xl p-4 max-w-md mx-auto">
              <p className="text-warning-800 font-medium">
                Üyeliğiniz iptal edildi.{' '}
                {membershipDetails.currentPeriodEnd
                  ? `${new Date(membershipDetails.currentPeriodEnd).toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' })} tarihine kadar`
                  : 'Dönem sonuna kadar'}{' '}
                premium özellikleriniz devam eder, ardından ücretsiz üyeliğe geçersiniz.
              </p>
            </div>
          )}
        </div>

        {/* Membership Details Card — tüm ücretli kademeler (basic dahil) */}
        {membershipDetails && membershipDetails.tier && membershipDetails.tier !== 'free' && (
          <div className="max-w-4xl mx-auto mb-12 bg-surface-elevated rounded-xl shadow-lg p-6 border border-border">
            <h2 className="text-2xl font-bold text-heading mb-6">Mevcut Üyelik Bilgileri</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-info-100 rounded-lg">
                  <CalendarIcon className="w-6 h-6 text-info-600" />
                </div>
                <div>
                  <p className="text-sm text-muted mb-1">Üyelik Başlangıç Tarihi</p>
                  <p className="text-lg font-semibold text-heading">
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
                <div className="p-3 bg-success-100 rounded-lg">
                  <CalendarIcon className="w-6 h-6 text-success-600" />
                </div>
                <div>
                  <p className="text-sm text-muted mb-1">{membershipDetails.status === 'cancelled' ? 'Geçerlilik Bitiş Tarihi' : 'Yenilenme Tarihi'}</p>
                  <p className="text-lg font-semibold text-heading">
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

            {/* Otomatik yenileme — hatırlatma tabanlı (sessiz çekim yok) */}
            <div className="border-t border-border pt-6 mb-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-heading">Otomatik Yenileme</h3>
                  <p className="text-sm text-muted mt-1">
                    Etkinleştirildiğinde üyeliğiniz dönem sonunda, seçtiğiniz plana (aylık
                    veya yıllık) göre kayıtlı kartınızdan otomatik olarak yenilenir. Devre dışı
                    bırakırsanız herhangi bir ücret tahsil edilmez. Kayıtlı kartınız yoksa
                    "Kart Ekle" ile ekleyebilirsiniz.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleToggleAutoRenew}
                  disabled={autoRenewSaving}
                  role="switch"
                  aria-checked={!!membershipDetails?.autoRenew}
                  className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full transition-colors ${
                    membershipDetails?.autoRenew ? 'bg-primary-500' : 'bg-border'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-surface-elevated shadow transition-transform ${
                      membershipDetails?.autoRenew ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Üyelik iptali — iptal edilmişse durum rozeti, değilse iptal butonu */}
            <div className="border-t border-border pt-6">
              {membershipDetails.status === 'cancelled' ? (
                <div className="bg-warning-50 border border-warning-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-warning-800">
                    Üyeliğiniz iptal edildi — dönem sonuna kadar (
                    {membershipDetails.currentPeriodEnd
                      ? new Date(membershipDetails.currentPeriodEnd).toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' })
                      : '-'}
                    ) tüm özellikleriniz aktif kalır. Sonrasında otomatik olarak ücretsiz plana geçilir.
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-heading">Üyeliği İptal Et</h3>
                    <p className="text-sm text-muted mt-1">
                      İptal ettiğinizde mevcut dönem sonuna kadar özelliklerinizi kullanmaya devam edersiniz; sonra ücretsiz plana geçilir. Ücret iadesi yapılmaz.
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={handleCancelMembership}
                    disabled={cancelling}
                    className="flex-shrink-0 px-5 py-2.5 border border-danger-300 text-danger-600 rounded-lg hover:bg-danger-50 disabled:opacity-50"
                  >
                    {cancelling ? 'İptal Ediliyor...' : 'Üyeliği İptal Et'}
                  </Button>
                </div>
              )}
            </div>

          </div>
        )}

        <div className="flex justify-center mb-8">
          <div className="inline-flex bg-surface-elevated rounded-lg p-1 shadow-sm border border-border">
            <Button variant="secondary" onClick={() => setSelectedPeriod('monthly')}
              className={`px-6 py-2 rounded-md font-medium transition-colors ${
                selectedPeriod === 'monthly'
                  ? 'bg-primary-500 text-inverted'
                  : 'text-muted hover:text-heading'
              }`}>
              {t('membership.monthly')}
            </Button>
            <Button variant="secondary" onClick={() => setSelectedPeriod('yearly')}
              className={`px-6 py-2 rounded-md font-medium transition-colors ${
                selectedPeriod === 'yearly'
                  ? 'bg-primary-500 text-inverted'
                  : 'text-muted hover:text-heading'
              }`}>
              {t('membership.yearly')}
              {(membershipPrices.yearly_discount_percentage ?? 20) > 0 && (
                <span className="ml-2 text-xs bg-success-100 text-success-700 px-2 py-0.5 rounded-full">
                  {membershipPrices.yearly_discount_percentage ?? 20}% {t('membership.savePercent')}
                </span>
              )}
            </Button>
          </div>
        </div>

        <div className="flex justify-center mb-8">
          <div className={`grid gap-6 ${
            MEMBERSHIP_TIERS.length === 1 
              ? 'grid-cols-1 max-w-md' 
              : MEMBERSHIP_TIERS.length === 2
                ? 'grid-cols-1 md:grid-cols-2 max-w-3xl'
                : MEMBERSHIP_TIERS.length === 3
                  ? 'grid-cols-1 md:grid-cols-3 max-w-5xl'
                  : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4 max-w-6xl'
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
                onClick={() => handleSelectTier(tier.id)}
                className={`relative bg-surface-elevated rounded-xl shadow-lg border-2 overflow-hidden transition-all cursor-pointer ${
                  isSelected
                    ? 'border-primary-500 ring-2 ring-primary-500 scale-105'
                    : tier.popular
                    ? 'border-primary-300 hover:border-primary-400'
                    : 'border-border hover:border-border'
                } ${tier.price === 0 && currentTier === 'free' && isAuthenticated ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {tier.popular && !isSelected && (
                  <div className="absolute top-0 right-0 bg-primary-500 text-inverted px-4 py-1 text-sm font-semibold rounded-bl-lg">
                    {t('membership.mostPopular')}
                  </div>
                )}
                {isSelected && (
                  <div className="absolute top-0 right-0 bg-success-500 text-inverted px-4 py-1 text-sm font-semibold rounded-bl-lg flex items-center gap-1">
                    <CheckIcon className="w-4 h-4" />
                    {t('common.selected')}
                  </div>
                )}
                {isCurrent && !isSelected && (
                  <div className="absolute top-0 left-0 bg-info-500 text-inverted px-4 py-1 text-sm font-semibold rounded-br-lg">
                    {t('membership.currentPlan')}
                  </div>
                )}

                <div className="p-6">
                  <div className="mb-6">
                    <h3 className="text-2xl font-bold text-heading mb-2">{tier.name}</h3>
                    <p className="text-muted text-sm">{tier.description}</p>
                  </div>

                  <div className="mb-6">
                    <div className="flex items-baseline">
                      <span className="text-4xl font-bold text-heading">
                        {tier.price === 0 ? 'Ücretsiz' : `${displayPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`}
                      </span>
                      {tier.price > 0 && (
                        <span className="ml-2 text-muted">
                          /{selectedPeriod === 'yearly' ? 'yıl' : 'ay'}
                        </span>
                      )}
                    </div>
                    {selectedPeriod === 'yearly' && tier.price > 0 && (
                      <p className="text-sm text-muted mt-1">
                        Ayda {Math.round(displayPrice / 12).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                        {tier.id === 'premium' && membershipPrices.premium_monthly_price && (
                          <span className="text-xs text-subtle ml-1">
                            (Normal: {membershipPrices.premium_monthly_price.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL)
                          </span>
                        )}
                        {tier.id === 'business' && membershipPrices.business_monthly_price && (
                          <span className="text-xs text-subtle ml-1">
                            (Normal: {membershipPrices.business_monthly_price.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL)
                          </span>
                        )}
                        {membershipPrices.yearly_discount_percentage && (
                          <span className="text-xs text-success-500 ml-1">
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
                          <CheckIcon className="w-5 h-5 text-success-500 mr-2 flex-shrink-0 mt-0.5" />
                        ) : (
                          <XMarkIcon className="w-5 h-5 text-border-strong mr-2 flex-shrink-0 mt-0.5" />
                        )}
                        <span className={`text-sm ${feature.included ? 'text-body' : 'text-subtle'}`}>
                          {feature.text}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className={`w-full py-3 rounded-lg font-semibold text-center transition-colors ${
                    isSelected
                      ? 'bg-primary-500 text-inverted'
                      : isCurrent
                      ? 'bg-info-100 text-info-700'
                      : tier.price === 0
                      ? 'bg-surface-alt text-subtle'
                      : 'bg-surface-alt text-body group-hover:bg-border-subtle'
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
            <Button variant="secondary" onClick={handleContinue}
              className="px-12 py-4 bg-primary-500 text-inverted text-lg font-semibold rounded-xl hover:bg-primary-600 transition-colors shadow-lg hover:shadow-xl">
              {t('common.continue')}
            </Button>
          </motion.div>
        )}

        <div className="max-w-3xl mx-auto mt-16">
          <h2 className="text-2xl font-bold text-heading text-center mb-8">{t('nav.faq')}</h2>
          <div className="space-y-4">
            <div className="bg-surface-elevated rounded-lg p-6 shadow-sm">
              <h3 className="font-semibold text-heading mb-2">{t('membership.upgrade')}?</h3>
              <p className="text-muted">
                {t('membership.subtitle')}
              </p>
            </div>
            <div className="bg-surface-elevated rounded-lg p-6 shadow-sm">
              <h3 className="font-semibold text-heading mb-2">{t('membership.listingsLimit')}?</h3>
              <p className="text-muted">
                {t('membership.features')}
              </p>
            </div>
            <div className="bg-surface-elevated rounded-lg p-6 shadow-sm">
              <h3 className="font-semibold text-heading mb-2">{t('nav.trades')}?</h3>
              <p className="text-muted">
                {t('trade.tradeRequiresLogin')}
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

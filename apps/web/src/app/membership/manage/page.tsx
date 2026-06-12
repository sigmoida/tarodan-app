'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  SparklesIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import AuthLoadingScreen from '@/components/AuthLoadingScreen';
import api from '@/lib/api';
import { Button } from '@tarodan/ui';

interface MembershipInfo {
  tier: string;
  tierName: string;
  startDate: string;
  endDate: string;
  autoRenew: boolean;
  nextBillingDate?: string;
  nextBillingAmount?: number;
  features: string[];
}

const tierColors: Record<string, string> = {
  free: 'bg-surface-alt text-body',
  basic: 'bg-info-100 text-info-800',
  premium: 'bg-primary-100 text-primary-800',
  business: 'bg-warning-100 text-warning-800',
};

const tierNames: Record<string, string> = {
  free: 'Ücretsiz Üyelik',
  basic: 'Temel Üyelik',
  premium: 'Premium Üyelik',
  business: 'Business Üyelik',
};

const tierPrices: Record<string, number> = {
  basic: 49,
  premium: 99,
  business: 299,
};

export default function MembershipManagePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading, user } = useAuthStore();
  const [membership, setMembership] = useState<MembershipInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [processingAutoRenew, setProcessingAutoRenew] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push('/login?redirect=/membership/manage');
      return;
    }
    fetchMembershipInfo();
  }, [authLoading, isAuthenticated]);

  const fetchMembershipInfo = async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/membership/me');
      // API yanıtında tier bir nesnedir ({ type, name, ... }) ve dönem alanları
      // currentPeriodStart/End adındadır; sayfanın beklediği düz şekle çevir.
      const m = response.data;
      const tierType: string = m?.tier?.type ?? 'free';
      setMembership({
        tier: tierType,
        tierName: m?.tier?.name ?? tierNames[tierType] ?? 'Ücretsiz Üyelik',
        startDate: m?.currentPeriodStart ?? '',
        endDate: m?.currentPeriodEnd ?? '',
        autoRenew: !!m?.autoRenew,
        nextBillingDate: m?.autoRenew ? m?.currentPeriodEnd : undefined,
        nextBillingAmount: m?.tier?.monthlyPrice ?? tierPrices[tierType] ?? undefined,
        features: getFeaturesByTier(tierType),
      });
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Failed to fetch membership:', error);
      const tier = user?.membershipTier || 'free';
      setMembership({
        tier,
        tierName: tierNames[tier] || 'Ücretsiz Üyelik',
        startDate: user?.createdAt ? (typeof user.createdAt === 'string' ? user.createdAt : new Date(user.createdAt).toISOString()) : new Date().toISOString(),
        endDate: tier === 'free' ? '' : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        autoRenew: false,
        nextBillingDate: tier !== 'free' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : undefined,
        nextBillingAmount: tierPrices[tier] || undefined,
        features: getFeaturesByTier(tier),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getFeaturesByTier = (tier: string): string[] => {
    if (tier === 'free') {
      return ['10 ilan hakkı', '3 resim/ilan', 'Temel arama', 'Favorilere ekleme', 'Mesajlaşma'];
    }
    if (tier === 'basic') {
      return ['50 aktif ilan', '6 resim/ilan', 'Takas özelliği', 'Koleksiyon oluşturma', '2 öne çıkan ilan'];
    }
    if (tier === 'premium') {
      return ['200 aktif ilan', '10 resim/ilan', 'Takas özelliği', 'Koleksiyon oluşturma', 'Reklamsız deneyim', '10 öne çıkan ilan'];
    }
    if (tier === 'business') {
      return ['1000 aktif ilan', '15 resim/ilan', 'Tüm Premium özellikler', 'Kurumsal profil', 'Toplu ilan yönetimi', 'API erişimi', 'Özel destek', '50 öne çıkan ilan'];
    }
    return [];
  };

  const handleCancelSubscription = async () => {
    if (!confirm('Üyeliğinizi iptal etmek istediğinizden emin misiniz? Mevcut dönem sonuna kadar özelliklerinizi kullanmaya devam edebilirsiniz.')) {
      return;
    }

    setCancelling(true);
    try {
      await api.post('/membership/cancel');
      toast.success('Üyelik iptal talebi alındı');
      fetchMembershipInfo();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'İptal işlemi başarısız');
    } finally {
      setCancelling(false);
    }
  };

  const handleToggleAutoRenew = async () => {
    const next = !membership?.autoRenew;
    setProcessingAutoRenew(true);
    try {
      await api.patch('/membership/auto-renew', { autoRenew: next });
      setMembership(prev => prev ? { ...prev, autoRenew: next } : null);
      toast.success(next ? 'Otomatik yenileme aktifleştirildi' : 'Otomatik yenileme kapatıldı');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'İşlem başarısız');
    } finally {
      setProcessingAutoRenew(false);
    }
  };

  if (authLoading) {
    return <AuthLoadingScreen />;
  }
  if (!isAuthenticated) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface py-8">
        <div className="max-w-2xl mx-auto px-4">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-border-subtle rounded w-1/3" />
            <div className="h-64 bg-border-subtle rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  const tier = membership?.tier || 'free';
  const isPaid = tier !== 'free';

  return (
    <div className="min-h-screen bg-surface py-8">
      <div className="max-w-2xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 text-muted hover:text-heading mb-4"
          >
            <ArrowLeftIcon className="w-5 h-5" />
            Profile Dön
          </Link>
          <h1 className="text-3xl font-bold text-heading flex items-center gap-3">
            <SparklesIcon className="w-8 h-8 text-primary-500" />
            Üyelik Yönetimi
          </h1>
        </div>

        {/* Current Plan */}
        <div className="bg-surface-elevated rounded-xl p-6 border border-border mb-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${tierColors[tier]}`}>
                {membership?.tierName}
              </span>
            </div>
            {isPaid && (
              <span className="flex items-center gap-1 text-success-600 text-sm font-medium">
                <CheckCircleIcon className="w-5 h-5" />
                Aktif
              </span>
            )}
          </div>

          <div className="space-y-4 mb-6">
            <h3 className="font-semibold text-heading">Mevcut Özellikler</h3>
            <ul className="space-y-2">
              {(membership?.features || []).map((feature, idx) => (
                <li key={idx} className="flex items-center gap-2 text-muted">
                  <CheckCircleIcon className="w-5 h-5 text-success-500 flex-shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          {isPaid && (
            <>
              <div className="border-t border-border pt-4 mb-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted">Başlangıç Tarihi</p>
                    <p className="font-medium text-heading">
                      {membership?.startDate && new Date(membership.startDate).toLocaleDateString('tr-TR')}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted">Bitiş Tarihi</p>
                    <p className="font-medium text-heading">
                      {membership?.endDate && new Date(membership.endDate).toLocaleDateString('tr-TR')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Auto Renew Section */}
              <div className="p-4 bg-surface rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ArrowPathIcon className="w-5 h-5 text-muted" />
                    <div>
                      <p className="font-medium text-heading">Otomatik Yenileme</p>
                      <p className="text-sm text-muted">
                        {membership?.autoRenew
                          ? 'Dönem sonunda yenileme hatırlatması gönderilecek — tek tıkla yenileyebilirsiniz.'
                          : 'Kapalı — dönem sonunda üyeliğiniz sona erecek.'}
                      </p>
                    </div>
                  </div>
                  <Button variant="secondary" onClick={handleToggleAutoRenew}
                    disabled={processingAutoRenew}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                      membership?.autoRenew ? 'bg-primary-500' : 'bg-border-strong'
                    }`}>
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-surface-elevated transition-transform ${
                        membership?.autoRenew ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-4">
          {!isPaid ? (
            <Link
              href="/pricing"
              className="block w-full py-4 bg-primary-500 hover:bg-primary-600 text-inverted rounded-xl font-semibold text-center transition-colors"
            >
              Üyeliği Yükselt
            </Link>
          ) : (
            <>
              <Link
                href="/pricing"
                className="block w-full py-4 bg-primary-500 hover:bg-primary-600 text-inverted rounded-xl font-semibold text-center transition-colors"
              >
                Plan Değiştir
              </Link>
              <Button variant="secondary" onClick={handleCancelSubscription}
                disabled={cancelling}
                className="w-full py-4 border border-danger-300 text-danger-600 hover:bg-danger-50 rounded-xl font-semibold transition-colors disabled:opacity-50">
                {cancelling ? 'İptal Ediliyor...' : 'Üyeliği İptal Et'}
              </Button>
            </>
          )}
        </div>

        {/* Help */}
        <div className="mt-8 p-4 bg-info-50 border border-info-200 rounded-xl">
          <p className="text-info-800 text-sm">
            Üyelik ile ilgili sorularınız için{' '}
            <Link href="/support" className="font-medium underline">
              destek ekibimizle
            </Link>
            {' '}iletişime geçebilirsiniz.
          </p>
        </div>
      </div>

    </div>
  );
}

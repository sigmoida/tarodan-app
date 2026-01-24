'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  SparklesIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  XCircleIcon,
  CalendarDaysIcon,
  CreditCardIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';

interface MembershipInfo {
  tier: string;
  tierName: string;
  startDate: string;
  endDate: string;
  isAutoRenew: boolean;
  nextBillingDate?: string;
  nextBillingAmount?: number;
  features: string[];
}

const tierColors: Record<string, string> = {
  free: 'bg-gray-100 text-gray-800',
  basic: 'bg-blue-100 text-blue-800',
  premium: 'bg-purple-100 text-purple-800',
  business: 'bg-amber-100 text-amber-800',
};

const tierNames: Record<string, string> = {
  free: 'Ücretsiz Üyelik',
  basic: 'Temel Üyelik',
  premium: 'Premium Üyelik',
  business: 'Business Üyelik',
};

export default function MembershipManagePage() {
  const router = useRouter();
  const { isAuthenticated, user, limits } = useAuthStore();
  const [membership, setMembership] = useState<MembershipInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login?redirect=/membership/manage');
      return;
    }
    fetchMembershipInfo();
  }, [isAuthenticated]);

  const fetchMembershipInfo = async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/membership/me');
      setMembership(response.data);
    } catch (error) {
      console.error('Failed to fetch membership:', error);
      // Set default based on user data
      const tier = user?.membershipTier || 'free';
      setMembership({
        tier,
        tierName: tierNames[tier] || 'Ücretsiz Üyelik',
        startDate: user?.createdAt || new Date().toISOString(),
        endDate: tier === 'free' ? '' : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        isAutoRenew: tier !== 'free',
        nextBillingDate: tier !== 'free' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : undefined,
        nextBillingAmount: tier === 'premium' ? 99 : tier === 'business' ? 299 : undefined,
        features: getFeaturesByTier(tier),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getFeaturesByTier = (tier: string): string[] => {
    if (tier === 'free') {
      return [
        '5 ilan hakkı',
        'Temel arama',
        'Favorilere ekleme',
        'Mesajlaşma',
      ];
    }
    if (tier === 'basic') {
      return [
        '20 ilan hakkı',
        'Gelişmiş arama',
        'Favorilere ekleme',
        'Mesajlaşma',
        'Temel analitik',
      ];
    }
    if (tier === 'premium') {
      return [
        'Sınırsız ilan',
        'Takas özelliği',
        'Koleksiyon oluşturma',
        'Öne çıkan ilanlar',
        'Detaylı analitik',
        'Öncelikli destek',
      ];
    }
    if (tier === 'business') {
      return [
        'Tüm Premium özellikler',
        'Kurumsal profil',
        'Toplu ilan yönetimi',
        'API erişimi',
        'Özel destek',
        'Reklam indirimi',
      ];
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
    try {
      await api.patch('/membership/auto-renew', {
        enabled: !membership?.isAutoRenew,
      });
      setMembership(prev => prev ? { ...prev, isAutoRenew: !prev.isAutoRenew } : null);
      toast.success(membership?.isAutoRenew ? 'Otomatik yenileme kapatıldı' : 'Otomatik yenileme açıldı');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'İşlem başarısız');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-2xl mx-auto px-4">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-1/3" />
            <div className="h-64 bg-gray-200 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  const tier = membership?.tier || 'free';
  const isPaid = tier !== 'free';

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeftIcon className="w-5 h-5" />
            Profile Dön
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <SparklesIcon className="w-8 h-8 text-primary-500" />
            Üyelik Yönetimi
          </h1>
        </div>

        {/* Current Plan */}
        <div className="bg-white rounded-xl p-6 border border-gray-200 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${tierColors[tier]}`}>
                {membership?.tierName}
              </span>
            </div>
            {isPaid && (
              <span className="flex items-center gap-1 text-green-600 text-sm font-medium">
                <CheckCircleIcon className="w-5 h-5" />
                Aktif
              </span>
            )}
          </div>

          <div className="space-y-4 mb-6">
            <h3 className="font-semibold text-gray-900">Mevcut Özellikler</h3>
            <ul className="space-y-2">
              {membership?.features.map((feature, idx) => (
                <li key={idx} className="flex items-center gap-2 text-gray-600">
                  <CheckCircleIcon className="w-5 h-5 text-green-500 flex-shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          {isPaid && (
            <>
              <div className="border-t border-gray-200 pt-4 mb-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Başlangıç Tarihi</p>
                    <p className="font-medium text-gray-900">
                      {membership?.startDate && new Date(membership.startDate).toLocaleDateString('tr-TR')}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500">Bitiş Tarihi</p>
                    <p className="font-medium text-gray-900">
                      {membership?.endDate && new Date(membership.endDate).toLocaleDateString('tr-TR')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <ArrowPathIcon className="w-5 h-5 text-gray-500" />
                  <div>
                    <p className="font-medium text-gray-900">Otomatik Yenileme</p>
                    <p className="text-sm text-gray-500">
                      {membership?.isAutoRenew
                        ? `Sonraki ödeme: ${membership.nextBillingDate && new Date(membership.nextBillingDate).toLocaleDateString('tr-TR')} - ₺${membership.nextBillingAmount}`
                        : 'Kapalı'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleToggleAutoRenew}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    membership?.isAutoRenew ? 'bg-primary-500' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      membership?.isAutoRenew ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-4">
          {!isPaid ? (
            <Link
              href="/pricing"
              className="block w-full py-4 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-semibold text-center transition-colors"
            >
              Üyeliği Yükselt
            </Link>
          ) : (
            <>
              <Link
                href="/pricing"
                className="block w-full py-4 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-semibold text-center transition-colors"
              >
                Plan Değiştir
              </Link>
              <button
                onClick={handleCancelSubscription}
                disabled={cancelling}
                className="w-full py-4 border border-red-300 text-red-600 hover:bg-red-50 rounded-xl font-semibold transition-colors disabled:opacity-50"
              >
                {cancelling ? 'İptal Ediliyor...' : 'Üyeliği İptal Et'}
              </button>
            </>
          )}
        </div>

        {/* Help */}
        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <p className="text-blue-800 text-sm">
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

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeftIcon, CheckIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { membershipApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

interface Membership {
  tier: string;
  expiresAt?: string;
  isActive: boolean;
}

export default function MembershipPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const [membership, setMembership] = useState<Membership | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    loadMembership();
  }, [isAuthenticated]);

  const loadMembership = async () => {
    try {
      const response = await membershipApi.getCurrentMembership().catch(() => null);
      if (response) {
        const data = response.data.membership || response.data;
        setMembership(data);
      } else {
        // Default to free tier if no membership
        setMembership({ tier: 'free', isActive: true });
      }
    } catch (error) {
      console.error('Membership load error:', error);
      setMembership({ tier: 'free', isActive: true });
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = (tier: string) => {
    router.push(`/pricing?tier=${tier}`);
  };

  if (!isAuthenticated) {
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white">
        <main className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
          </div>
        </main>
      </div>
    );
  }

  const currentTier = membership?.tier || 'free';
  const tierNames: Record<string, string> = {
    free: 'Ücretsiz',
    premium: 'Premium',
    business: 'İş',
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <main className="max-w-4xl mx-auto px-4 py-8">
        <Link
          href="/profile"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-8"
        >
          <ArrowLeftIcon className="w-5 h-5" />
          Profile Dön
        </Link>

        <h1 className="text-3xl font-bold mb-8">Üyelik Planım</h1>

        <div className="bg-gray-800 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold mb-2">
                {tierNames[currentTier]} Plan
              </h2>
              {membership?.expiresAt ? (
                <p className="text-gray-400">
                  Bitiş Tarihi: {new Date(membership.expiresAt).toLocaleDateString('tr-TR')}
                </p>
              ) : (
                <p className="text-gray-400">Süresiz</p>
              )}
            </div>
            <div className="text-right">
              {membership?.isActive ? (
                <span className="px-4 py-2 bg-green-500/20 text-green-400 rounded-lg">
                  Aktif
                </span>
              ) : (
                <span className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg">
                  Pasif
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4">Plan Özellikleri</h2>
          <div className="space-y-3">
            {currentTier === 'free' && (
              <>
                <div className="flex items-center gap-3">
                  <CheckIcon className="w-5 h-5 text-green-400" />
                  <span>5 aktif ilan hakkı</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckIcon className="w-5 h-5 text-green-400" />
                  <span>Temel arama ve filtreleme</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckIcon className="w-5 h-5 text-green-400" />
                  <span>Mesajlaşma</span>
                </div>
              </>
            )}
            {currentTier === 'premium' && (
              <>
                <div className="flex items-center gap-3">
                  <CheckIcon className="w-5 h-5 text-green-400" />
                  <span>Sınırsız aktif ilan</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckIcon className="w-5 h-5 text-green-400" />
                  <span>15 resim/ilan</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckIcon className="w-5 h-5 text-green-400" />
                  <span>Takas yapma</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckIcon className="w-5 h-5 text-green-400" />
                  <span>Sınırsız koleksiyon (Digital Garage)</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckIcon className="w-5 h-5 text-green-400" />
                  <span>Reklamsız deneyim</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckIcon className="w-5 h-5 text-green-400" />
                  <span>3 öne çıkan ilan</span>
                </div>
              </>
            )}
            {currentTier === 'business' && (
              <>
                <div className="flex items-center gap-3">
                  <CheckIcon className="w-5 h-5 text-green-400" />
                  <span>1000 aktif ilan hakkı</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckIcon className="w-5 h-5 text-green-400" />
                  <span>Gelişmiş özellikler</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckIcon className="w-5 h-5 text-green-400" />
                  <span>Reklamsız deneyim</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckIcon className="w-5 h-5 text-green-400" />
                  <span>7/24 öncelikli destek</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckIcon className="w-5 h-5 text-green-400" />
                  <span>Özel API erişimi</span>
                </div>
              </>
            )}
          </div>
        </div>

        {currentTier !== 'business' && (
          <div className="mt-6">
            <Link
              href="/pricing"
              className="block w-full py-3 bg-primary-500 hover:bg-primary-600 rounded-lg text-center transition-colors"
            >
              Planı Yükselt
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}

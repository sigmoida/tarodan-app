'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import { UserMinusIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';

interface FollowedUser {
  id: string;
  followingId: string;
  createdAt: string;
  following: {
    id: string;
    displayName: string;
    avatarUrl?: string;
    bio?: string;
    _count?: {
      products: number;
    };
  };
}

export default function FollowingPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const [following, setFollowing] = useState<FollowedUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login?redirect=/profile/following');
      return;
    }
    loadFollowing();
  }, [isAuthenticated]);

  const loadFollowing = async () => {
    setLoading(true);
    try {
      const response = await api.get('/users/me/following');
      const data = response.data.data || response.data.following || response.data || [];
      setFollowing(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load following:', error);
      setFollowing([]);
    } finally {
      setLoading(false);
    }
  };

  const handleUnfollow = async (userId: string) => {
    try {
      await api.delete(`/users/${userId}/follow`);
      toast.success('Takip bırakıldı');
      setFollowing(prev => prev.filter(f => f.following.id !== userId));
    } catch (error: any) {
      console.error('Unfollow error:', error);
      toast.error('Takip bırakılamadı');
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/profile" className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
            <ArrowLeftIcon className="w-6 h-6 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Takip Ettiklerim</h1>
            <p className="text-sm text-gray-500">{following.length} satıcı takip ediliyor</p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
          </div>
        ) : following.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-4xl">👤</span>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Henüz kimseyi takip etmiyorsunuz
            </h2>
            <p className="text-gray-600 mb-6">
              Satıcıları takip ederek yeni ilanlarından haberdar olun
            </p>
            <Link
              href="/listings"
              className="inline-block px-6 py-3 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 transition-colors"
            >
              İlanları Keşfet
            </Link>
          </div>
        ) : (
          <div className="grid gap-4">
            {following.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-4"
              >
                <Link
                  href={`/seller/${item.following.id}`}
                  className="flex items-center gap-4 flex-1 hover:opacity-80 transition-opacity"
                >
                  <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center overflow-hidden">
                    {item.following.avatarUrl ? (
                      <Image
                        src={item.following.avatarUrl}
                        alt={item.following.displayName}
                        width={64}
                        height={64}
                        className="object-cover"
                      />
                    ) : (
                      <span className="text-2xl font-bold text-primary-600">
                        {item.following.displayName?.[0]?.toUpperCase() || '?'}
                      </span>
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">
                      {item.following.displayName}
                    </h3>
                    {item.following.bio && (
                      <p className="text-sm text-gray-500 line-clamp-1">
                        {item.following.bio}
                      </p>
                    )}
                    <p className="text-sm text-gray-400 mt-1">
                      {item.following._count?.products || 0} ilan
                    </p>
                  </div>
                </Link>
                <button
                  onClick={() => handleUnfollow(item.following.id)}
                  className="px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors flex items-center gap-2"
                >
                  <UserMinusIcon className="w-5 h-5" />
                  <span className="hidden sm:inline">Takibi Bırak</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

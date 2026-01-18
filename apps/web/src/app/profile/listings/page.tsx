'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import {
  PlusIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  PencilIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import { userApi } from '@/lib/api';

interface Listing {
  id: string;
  title: string;
  price: number;
  status: string;
  images?: Array<{ url: string } | string>;
  createdAt: string;
  viewCount?: number;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: 'Onay Bekliyor', color: 'bg-yellow-100 text-yellow-700', icon: ClockIcon },
  active: { label: 'Aktif', color: 'bg-green-100 text-green-700', icon: CheckCircleIcon },
  rejected: { label: 'Reddedildi', color: 'bg-red-100 text-red-700', icon: XCircleIcon },
  sold: { label: 'Satıldı', color: 'bg-orange-100 text-orange-700', icon: CheckCircleIcon },
  reserved: { label: 'Rezerve', color: 'bg-purple-100 text-purple-700', icon: ClockIcon },
  inactive: { label: 'Pasif', color: 'bg-gray-100 text-gray-700', icon: XCircleIcon },
};

const FILTER_TABS = [
  { value: '', label: 'Tümü' },
  { value: 'pending', label: 'Onay Bekleyen' },
  { value: 'active', label: 'Aktif' },
  { value: 'sold', label: 'Satılan' },
];

export default function ProfileListingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  
  const [listings, setListings] = useState<Listing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState(searchParams.get('status') || '');

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast.error('İlanlarınızı görmek için giriş yapmalısınız');
      router.push('/login?redirect=/profile/listings');
      return;
    }
    if (isAuthenticated) {
      fetchListings();
    }
  }, [isAuthenticated, authLoading, activeFilter]);

  const fetchListings = async () => {
    setIsLoading(true);
    try {
      const params: Record<string, any> = {};
      if (activeFilter) params.status = activeFilter;
      
      const response = await userApi.getMyProducts(params);
      const data = response.data.data || response.data.products || response.data || [];
      setListings(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch listings:', error);
      toast.error('İlanlar yüklenemedi');
      setListings([]);
    } finally {
      setIsLoading(false);
    }
  };

  const getImageUrl = (listing: Listing): string => {
    if (!listing.images || listing.images.length === 0) {
      return 'https://placehold.co/200x200/f3f4f6/9ca3af?text=Ürün';
    }
    const firstImage = listing.images[0];
    return typeof firstImage === 'string' ? firstImage : firstImage.url;
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">İlanlarım</h1>
            <p className="text-gray-600 mt-1">Tüm ilanlarınızı yönetin</p>
          </div>
          <Link href="/listings/new" className="btn-primary flex items-center gap-2">
            <PlusIcon className="w-5 h-5" />
            Yeni İlan
          </Link>
        </div>

        {/* Pending Listings Alert */}
        {listings.some(l => l.status === 'pending') && activeFilter !== 'pending' && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
            <div className="flex items-center gap-3">
              <ClockIcon className="w-6 h-6 text-yellow-600" />
              <div>
                <p className="font-medium text-yellow-800">
                  {listings.filter(l => l.status === 'pending').length} ilanınız onay bekliyor
                </p>
                <p className="text-sm text-yellow-600">
                  İlanlar admin tarafından onaylandıktan sonra yayına alınacaktır.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveFilter(tab.value)}
              className={`px-4 py-2 rounded-full font-medium transition-colors whitespace-nowrap ${
                activeFilter === tab.value
                  ? 'bg-primary-500 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              {tab.label}
              {tab.value === 'pending' && listings.filter(l => l.status === 'pending').length > 0 && (
                <span className="ml-2 bg-yellow-500 text-white text-xs px-2 py-0.5 rounded-full">
                  {listings.filter(l => l.status === 'pending').length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Listings Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="card p-4 animate-pulse">
                <div className="aspect-square bg-gray-200 rounded-lg mb-4" />
                <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
                <div className="h-4 bg-gray-200 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl">
            <div className="text-6xl mb-4">📦</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {activeFilter ? 'Bu filtreye uygun ilan yok' : 'Henüz ilanınız yok'}
            </h3>
            <p className="text-gray-600 mb-6">
              Koleksiyonunuzdaki ürünleri satışa çıkarın
            </p>
            <Link href="/listings/new" className="btn-primary">
              İlk İlanınızı Oluşturun
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {listings.map((listing, index) => {
              const statusConfig = STATUS_CONFIG[listing.status] || STATUS_CONFIG.pending;
              const StatusIcon = statusConfig.icon;
              
              return (
                <motion.div
                  key={listing.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="card overflow-hidden"
                >
                  <div className="relative">
                    <div className="aspect-square bg-gray-100">
                      <Image
                        src={getImageUrl(listing)}
                        alt={listing.title}
                        fill
                        className="object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'https://placehold.co/200x200/f3f4f6/9ca3af?text=Ürün';
                        }}
                      />
                    </div>
                    <div className="absolute top-2 left-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusConfig.color}`}>
                        <StatusIcon className="w-3 h-3" />
                        {statusConfig.label}
                      </span>
                    </div>
                  </div>
                  
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900 line-clamp-2 mb-2">
                      {listing.title}
                    </h3>
                    <p className="text-xl font-bold text-primary-500 mb-3">
                      ₺{Number(listing.price).toLocaleString('tr-TR')}
                    </p>
                    
                    <div className="flex items-center justify-between text-sm text-gray-500 mb-3">
                      <span>{new Date(listing.createdAt).toLocaleDateString('tr-TR')}</span>
                      {listing.viewCount !== undefined && (
                        <span className="flex items-center gap-1">
                          <EyeIcon className="w-4 h-4" />
                          {listing.viewCount}
                        </span>
                      )}
                    </div>
                    
                    <div className="flex gap-2">
                      {listing.status === 'active' && (
                        <Link
                          href={`/listings/${listing.id}`}
                          className="flex-1 py-2 text-center bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
                        >
                          Görüntüle
                        </Link>
                      )}
                      {['active', 'pending', 'inactive'].includes(listing.status) && (
                        <Link
                          href={`/listings/${listing.id}/edit`}
                          className="flex-1 py-2 text-center bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1"
                        >
                          <PencilIcon className="w-4 h-4" />
                          Düzenle
                        </Link>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

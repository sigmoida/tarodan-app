'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MagnifyingGlassIcon, TrashIcon, BellIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';

interface SavedSearch {
  id: string;
  query: string;
  filters?: {
    category?: string;
    brand?: string;
    minPrice?: number;
    maxPrice?: number;
    condition?: string;
  };
  createdAt: string;
  notifyEnabled: boolean;
}

const STORAGE_KEY = 'diecast_saved_searches';

export default function SavedSearchesPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Get limit based on membership
  const searchLimit = user?.membershipTier === 'free' ? 5 : 
                      user?.membershipTier === 'premium' ? 20 : 50;

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login?redirect=/saved-searches');
      return;
    }
    loadSavedSearches();
  }, [isAuthenticated]);

  const loadSavedSearches = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const searches = JSON.parse(stored);
        setSavedSearches(searches);
      }
    } catch (error) {
      console.error('Failed to load saved searches:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveSearches = (searches: SavedSearch[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(searches));
    setSavedSearches(searches);
  };

  const handleDelete = (id: string) => {
    if (!confirm('Bu aramayı silmek istediğinizden emin misiniz?')) return;
    const updated = savedSearches.filter(s => s.id !== id);
    saveSearches(updated);
    toast.success('Arama silindi');
  };

  const handleToggleNotify = (id: string) => {
    const updated = savedSearches.map(s => 
      s.id === id ? { ...s, notifyEnabled: !s.notifyEnabled } : s
    );
    saveSearches(updated);
    const search = updated.find(s => s.id === id);
    toast.success(search?.notifyEnabled ? 'Bildirimler açıldı' : 'Bildirimler kapatıldı');
  };

  const handleRunSearch = (search: SavedSearch) => {
    const params = new URLSearchParams();
    if (search.query) params.set('q', search.query);
    if (search.filters?.category) params.set('category', search.filters.category);
    if (search.filters?.brand) params.set('brand', search.filters.brand);
    if (search.filters?.minPrice) params.set('minPrice', String(search.filters.minPrice));
    if (search.filters?.maxPrice) params.set('maxPrice', String(search.filters.maxPrice));
    if (search.filters?.condition) params.set('condition', search.filters.condition);
    
    router.push(`/listings?${params.toString()}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/3" />
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeftIcon className="w-5 h-5" />
            Profile Dön
          </Link>
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <MagnifyingGlassIcon className="w-8 h-8 text-primary-500" />
              Kayıtlı Aramalarım
            </h1>
            <span className="text-sm text-gray-500">
              {savedSearches.length} / {searchLimit} arama
            </span>
          </div>
          <p className="text-gray-600 mt-2">
            Kayıtlı aramalarınızı buradan yönetebilir, bildirim tercihlerini değiştirebilirsiniz.
          </p>
        </div>

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
          <p className="text-blue-800 text-sm">
            <strong>İpucu:</strong> Arama yaparken sonuç sayfasında "Bu aramayı kaydet" butonunu kullanarak yeni arama ekleyebilirsiniz.
          </p>
        </div>

        {/* Searches List */}
        {savedSearches.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center border border-gray-200">
            <MagnifyingGlassIcon className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Kayıtlı Arama Yok
            </h2>
            <p className="text-gray-600 mb-6">
              Henüz kayıtlı aramanız bulunmuyor. İlanları ararken "Bu aramayı kaydet" butonunu kullanın.
            </p>
            <Link
              href="/listings"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-medium transition-colors"
            >
              <MagnifyingGlassIcon className="w-5 h-5" />
              İlan Ara
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {savedSearches.map((search) => (
              <div
                key={search.id}
                className="bg-white rounded-xl p-6 border border-gray-200 hover:border-gray-300 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 text-lg mb-2">
                      "{search.query || 'Tüm ilanlar'}"
                    </h3>
                    {search.filters && Object.keys(search.filters).length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {search.filters.category && (
                          <span className="px-2 py-1 bg-gray-100 text-gray-700 text-sm rounded">
                            Kategori: {search.filters.category}
                          </span>
                        )}
                        {search.filters.brand && (
                          <span className="px-2 py-1 bg-gray-100 text-gray-700 text-sm rounded">
                            Marka: {search.filters.brand}
                          </span>
                        )}
                        {(search.filters.minPrice || search.filters.maxPrice) && (
                          <span className="px-2 py-1 bg-gray-100 text-gray-700 text-sm rounded">
                            Fiyat: {search.filters.minPrice || 0}₺ - {search.filters.maxPrice || '∞'}₺
                          </span>
                        )}
                        {search.filters.condition && (
                          <span className="px-2 py-1 bg-gray-100 text-gray-700 text-sm rounded">
                            Durum: {search.filters.condition}
                          </span>
                        )}
                      </div>
                    )}
                    <p className="text-sm text-gray-500">
                      Kaydedildi: {new Date(search.createdAt).toLocaleDateString('tr-TR')}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => handleToggleNotify(search.id)}
                      className={`p-2 rounded-lg transition-colors ${
                        search.notifyEnabled
                          ? 'bg-primary-100 text-primary-600'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                      title={search.notifyEnabled ? 'Bildirimleri kapat' : 'Bildirimleri aç'}
                    >
                      <BellIcon className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(search.id)}
                      className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                      title="Sil"
                    >
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-100">
                  <button
                    onClick={() => handleRunSearch(search)}
                    className="w-full py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <MagnifyingGlassIcon className="w-5 h-5" />
                    Bu Aramayı Çalıştır
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Limit Warning */}
        {savedSearches.length >= searchLimit && (
          <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-xl p-4">
            <p className="text-yellow-800 text-sm">
              Kayıtlı arama limitinize ulaştınız ({searchLimit} arama).{' '}
              {user?.membershipTier === 'free' && (
                <Link href="/pricing" className="font-medium underline">
                  Premium üyelikle daha fazla arama kaydedin →
                </Link>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

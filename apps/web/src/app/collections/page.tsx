'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { FolderPlusIcon } from '@heroicons/react/24/outline';
import { useAuthStore } from '@/stores/authStore';
import { collectionsApi } from '@/lib/api';

interface Collection {
  id: string;
  name: string;
  description?: string;
  coverImageUrl?: string;
  isPublic: boolean;
  itemCount: number;
  createdAt: string;
  userName?: string; // API returns userName directly
  user?: {
    id: string;
    displayName: string;
  };
}

export default function CollectionsPage() {
  const { isAuthenticated, user } = useAuthStore();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [myCollections, setMyCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'public' | 'mine'>('public');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  
  // Free üyeler koleksiyon oluşturamaz
  const canCreateCollection = user?.membershipTier !== 'free';
  
  const handleCreateClick = () => {
    if (!canCreateCollection) {
      setShowPremiumModal(true);
      return;
    }
    setShowCreateModal(true);
  };

  useEffect(() => {
    loadCollections();
  }, [isAuthenticated]);

  const loadCollections = async () => {
    setLoading(true);
    try {
      const publicResponse = await collectionsApi.browse({ isPublic: true });
      const publicData = publicResponse.data?.collections || publicResponse.data?.data || [];
      setCollections(Array.isArray(publicData) ? publicData : []);

      if (isAuthenticated) {
        try {
          const myResponse = await collectionsApi.getMyCollections();
          const myData = myResponse.data?.collections || myResponse.data?.data || [];
          setMyCollections(Array.isArray(myData) ? myData : []);
        } catch (e) {
          console.error('My collections load error:', e);
          setMyCollections([]);
        }
      }
    } catch (error) {
      console.error('Collections load error:', error);
      setCollections([]);
    } finally {
      setLoading(false);
    }
  };

  const displayedCollections = activeTab === 'public' ? collections : myCollections;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Koleksiyonlar</h1>
            <p className="text-gray-600 mt-1">
              Diecast model araba koleksiyonlarını keşfedin
            </p>
          </div>
          {isAuthenticated && (
            <button
              onClick={handleCreateClick}
              className="px-4 py-2 bg-primary-500 text-white hover:bg-primary-600 rounded-lg transition-colors"
            >
              + Yeni Koleksiyon
            </button>
          )}
        </div>

        {/* Tabs */}
        {isAuthenticated && (
          <div className="flex gap-4 mb-6">
            <button
              onClick={() => setActiveTab('public')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                activeTab === 'public'
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
              }`}
            >
              Herkese Açık
            </button>
            <button
              onClick={() => setActiveTab('mine')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                activeTab === 'mine'
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
              }`}
            >
              Koleksiyonlarım ({myCollections.length})
            </button>
          </div>
        )}

        {/* Collections Grid */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
          </div>
        ) : displayedCollections.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600">
              {activeTab === 'mine'
                ? 'Henüz koleksiyonunuz yok'
                : 'Henüz koleksiyon bulunmuyor'}
            </p>
            {activeTab === 'mine' && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-4 px-6 py-2 bg-primary-500 text-white hover:bg-primary-600 rounded-lg transition-colors"
              >
                İlk Koleksiyonunu Oluştur
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayedCollections.map((collection) => (
              <Link
                key={collection.id}
                href={`/collections/${collection.id}`}
                className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md hover:ring-2 hover:ring-primary-500 transition-all"
              >
                <div className="aspect-video bg-gray-100 relative">
                  {collection.coverImageUrl ? (
                    <Image
                      src={collection.coverImageUrl}
                      alt={collection.name}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-6xl">
                      🚗
                    </div>
                  )}
                  <div className="absolute top-2 right-2">
                    {collection.isPublic ? (
                      <span className="px-2 py-1 bg-green-500/90 text-white text-xs rounded-full">
                        Herkese Açık
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-gray-500/90 text-white text-xs rounded-full">
                        Özel
                      </span>
                    )}
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="text-lg font-semibold text-gray-900">{collection.name}</h3>
                  {collection.description && (
                    <p className="text-gray-500 text-sm mt-1 line-clamp-2">
                      {collection.description}
                    </p>
                  )}
                  <div className="flex items-center justify-between mt-3 text-sm text-gray-500">
                    <span>{collection.itemCount} ürün</span>
                    <span>@{collection.userName || collection.user?.displayName || 'Kullanıcı'}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Create Collection Modal */}
      {showCreateModal && (
        <CreateCollectionModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            loadCollections();
          }}
        />
      )}

      {/* Premium Required Modal */}
      {showPremiumModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl max-w-md w-full p-6 text-center"
          >
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FolderPlusIcon className="w-8 h-8 text-amber-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Premium Üyelik Gerekli
            </h2>
            <p className="text-gray-600 mb-6">
              Koleksiyon oluşturma özelliği sadece Premium ve üzeri üyelikler için aktiftir. 
              Üyeliğinizi yükselterek kendi koleksiyonlarınızı oluşturabilir ve paylaşabilirsiniz.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setShowPremiumModal(false)}
                className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
              >
                Vazgeç
              </button>
              <Link
                href="/membership"
                className="flex-1 px-4 py-3 bg-primary-500 text-white rounded-xl font-medium hover:bg-primary-600 transition-colors text-center"
              >
                Üyeliği Yükselt
              </Link>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function CreateCollectionModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await collectionsApi.create({ name, description, isPublic });
      onCreated();
    } catch (error: any) {
      console.error('Create collection error:', error);
      alert(error.response?.data?.message || 'Koleksiyon oluşturulamadı');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md">
        <h2 className="text-xl font-semibold mb-4">Yeni Koleksiyon</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">İsim</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 rounded-lg text-white"
              placeholder="Hot Wheels Koleksiyonum"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Açıklama</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 rounded-lg text-white"
              placeholder="Koleksiyon hakkında..."
              rows={3}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isPublic"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="w-4 h-4"
            />
            <label htmlFor="isPublic" className="text-sm">
              Herkese açık koleksiyon
            </label>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={loading || !name}
              className="flex-1 py-2 bg-primary-500 hover:bg-primary-600 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Oluşturuluyor...' : 'Oluştur'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

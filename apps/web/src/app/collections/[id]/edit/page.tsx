'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import { collectionsApi } from '@/lib/api';
import { ArrowLeftIcon, PhotoIcon } from '@heroicons/react/24/outline';

interface Collection {
  id: string;
  userId: string;
  name: string;
  description?: string;
  coverImageUrl?: string;
  isPublic: boolean;
}

export default function EditCollectionPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();
  const collectionId = params.id as string;

  const [collection, setCollection] = useState<Collection | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    isPublic: true,
  });

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    if (collectionId) {
      fetchCollection();
    }
  }, [isAuthenticated, collectionId]);

  const fetchCollection = async () => {
    setIsLoading(true);
    try {
      const response = await collectionsApi.getOne(collectionId);
      const data = response.data.collection || response.data;
      
      // Verify ownership
      if (data.userId !== user?.id) {
        toast.error('Bu koleksiyonu düzenleme yetkiniz yok');
        router.push('/collections');
        return;
      }
      
      setCollection(data);
      setFormData({
        name: data.name || '',
        description: data.description || '',
        isPublic: data.isPublic ?? true,
      });
    } catch (error: any) {
      console.error('Failed to fetch collection:', error);
      toast.error('Koleksiyon yüklenemedi');
      router.push('/collections');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast.error('Koleksiyon adı zorunludur');
      return;
    }
    
    setIsSaving(true);
    try {
      await collectionsApi.update(collectionId, {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        isPublic: formData.isPublic,
      });
      
      toast.success('Koleksiyon güncellendi!');
      router.push(`/collections/${collectionId}`);
    } catch (error: any) {
      console.error('Update error:', error);
      toast.error(error.response?.data?.message || 'Koleksiyon güncellenemedi');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Bu koleksiyonu silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.')) {
      return;
    }
    
    setIsDeleting(true);
    try {
      await collectionsApi.delete(collectionId);
      toast.success('Koleksiyon silindi');
      router.push('/collections');
    } catch (error: any) {
      console.error('Delete error:', error);
      toast.error(error.response?.data?.message || 'Koleksiyon silinemedi');
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isAuthenticated || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Koleksiyon bulunamadı</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link 
            href={`/collections/${collectionId}`} 
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <ArrowLeftIcon className="w-6 h-6 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Koleksiyonu Düzenle</h1>
            <p className="text-sm text-gray-500">{collection.name}</p>
          </div>
        </div>

        {/* Cover Image Preview */}
        {collection.coverImageUrl && (
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Kapak Görseli</h2>
            <div className="aspect-video bg-gray-100 rounded-xl overflow-hidden relative">
              <Image
                src={collection.coverImageUrl}
                alt={collection.name}
                fill
                className="object-cover"
              />
            </div>
            <p className="text-sm text-gray-500 mt-3">
              * Kapak görseli değiştirme özelliği yakında eklenecek
            </p>
          </div>
        )}

        {/* Edit Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-6 space-y-6">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Koleksiyon Adı *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="Örn: Hot Wheels Koleksiyonum"
              maxLength={100}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Açıklama
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="Koleksiyon hakkında bilgi..."
              maxLength={1000}
            />
          </div>

          {/* Visibility */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="isPublic"
              checked={formData.isPublic}
              onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
              className="w-5 h-5 text-primary-500 border-gray-300 rounded focus:ring-primary-500"
            />
            <label htmlFor="isPublic" className="text-sm text-gray-700">
              Herkese açık koleksiyon (diğer kullanıcılar görebilir)
            </label>
          </div>

          {/* Actions */}
          <div className="flex gap-4 pt-4">
            <Link
              href={`/collections/${collectionId}`}
              className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors text-center"
            >
              İptal
            </Link>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 px-6 py-3 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </div>
        </form>

        {/* Danger Zone */}
        <div className="bg-white rounded-xl shadow-sm p-6 mt-6 border-2 border-red-200">
          <h2 className="text-lg font-semibold text-red-600 mb-4">Tehlikeli Bölge</h2>
          <p className="text-gray-600 text-sm mb-4">
            Koleksiyonu sildiğinizde tüm içerik kalıcı olarak silinecektir. Bu işlem geri alınamaz.
          </p>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="px-6 py-3 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
          >
            {isDeleting ? 'Siliniyor...' : 'Koleksiyonu Sil'}
          </button>
        </div>
      </main>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeftIcon, TrashIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import { collectionsApi } from '@/lib/api';
import Image from 'next/image';
import { useTranslation } from '@/i18n/LanguageContext';

interface Collection {
  id: string;
  userId: string;
  userName: string;
  name: string;
  slug: string;
  description?: string;
  coverImageUrl?: string;
  isPublic: boolean;
  viewCount: number;
  likeCount: number;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

// UUID format checker
const isUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

export default function EditCollectionPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();
  const { t } = useTranslation();
  const collectionIdOrSlug = params.id as string;

  const [collection, setCollection] = useState<Collection | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);
  const [coverImagePreview, setCoverImagePreview] = useState<string>('');
  const [isUploadingCover, setIsUploadingCover] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      router.push('/login');
      return;
    }

    if (collectionIdOrSlug) {
      fetchCollection();
    }
  }, [collectionIdOrSlug, isAuthenticated, user]);

  const fetchCollection = async () => {
    if (!collectionIdOrSlug) {
      setError(t('collection.invalidLink'));
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      // Try UUID endpoint first if it looks like a UUID, otherwise try slug
      let response;
      if (isUUID(collectionIdOrSlug)) {
        response = await collectionsApi.getOne(collectionIdOrSlug);
      } else {
        response = await collectionsApi.getBySlug(collectionIdOrSlug);
      }
      const data = response.data.collection || response.data;
      setCollection(data);

      // Check if user is the owner
      if (data.userId !== user?.id) {
        setError(t('collection.noEditPermission'));
        setIsLoading(false);
        return;
      }

      // Populate form with existing data
      setName(data.name || '');
      setDescription(data.description || '');
      setCoverImageUrl(data.coverImageUrl || '');
      setCoverImagePreview(data.coverImageUrl || '');
      setIsPublic(data.isPublic ?? true);
    } catch (error: any) {
      console.error('Fetch collection error:', error);
      setError(error.response?.data?.message || t('collection.loadFailed'));
      toast.error(t('collection.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCoverImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Lütfen geçerli bir resim dosyası seçin');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Resim boyutu 10MB\'dan küçük olmalıdır');
      return;
    }

    setCoverImageFile(file);
    const preview = URL.createObjectURL(file);
    setCoverImagePreview(preview);

    // Upload cover image
    setIsUploadingCover(true);
    try {
      const response = await collectionsApi.updateCover(collection!.id, file);
      const newCoverUrl = response.data.collection?.coverImageUrl || response.data.coverImageUrl;
      if (newCoverUrl) {
        setCoverImageUrl(newCoverUrl);
        setCoverImagePreview(newCoverUrl);
        toast.success('Kapak resmi yüklendi');
      }
    } catch (error: any) {
      console.error('Cover image upload error:', error);
      toast.error(error.response?.data?.message || 'Kapak resmi yüklenemedi');
      setCoverImageFile(null);
      setCoverImagePreview(coverImageUrl);
    } finally {
      setIsUploadingCover(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast.error(t('collection.collectionNameRequired'));
      return;
    }

    if (!collection) {
      toast.error(t('collection.collectionNotFound'));
      return;
    }

    setIsSaving(true);
    try {
      await collectionsApi.update(collection.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        coverImageUrl: coverImageUrl.trim() || undefined,
        isPublic,
      });
      
      toast.success(t('collection.collectionUpdated'));
      // Use slug if available, otherwise use ID
      const redirectPath = collection.slug || collection.id;
      router.push(`/collections/${redirectPath}`);
    } catch (error: any) {
      console.error('Update collection error:', error);
      toast.error(error.response?.data?.message || t('collection.loadFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!collection) {
      toast.error(t('collection.collectionNotFound'));
      return;
    }

    setIsDeleting(true);
    try {
      await collectionsApi.delete(collection.id);
      toast.success(t('collection.collectionDeleted'));
      router.push('/collections');
    } catch (error: any) {
      console.error('Delete collection error:', error);
      toast.error(error.response?.data?.message || t('collection.loadFailed'));
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p className="text-gray-600">{t('collection.loading')}</p>
        </div>
      </div>
    );
  }

  if (error || !collection) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || t('collection.collectionNotFound')}</p>
          <button
            onClick={() => router.push('/collections')}
            className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
          >
            {t('collection.backToCollections')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
          >
            <ArrowLeftIcon className="w-5 h-5" />
            <span>{t('common.back')}</span>
          </button>
          <h1 className="text-3xl font-bold text-gray-900">{t('collection.editCollectionTitle')}</h1>
        </div>

        {/* Form */}
        <div className="bg-white rounded-xl shadow-sm p-6 md:p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('collection.collectionNameLabel')}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder={t('collection.namePlaceholder')}
                required
                minLength={3}
                maxLength={100}
              />
              <p className="mt-1 text-sm text-gray-500">
                {name.length}/100 {t('collection.characters')}
              </p>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('collection.descriptionLabel')}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder={t('collection.descriptionPlaceholder')}
                rows={5}
                maxLength={500}
              />
              <p className="mt-1 text-sm text-gray-500">
                {description.length}/500 {t('collection.characters')}
              </p>
            </div>

            {/* Cover Image Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Kapak Resmi
              </label>
              <div className="space-y-3">
                {coverImagePreview && (
                  <div className="relative w-full h-48 rounded-xl overflow-hidden border border-gray-300">
                    <Image
                      src={coverImagePreview}
                      alt="Cover preview"
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleCoverImageChange}
                  disabled={isUploadingCover}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                />
                {isUploadingCover && (
                  <p className="text-sm text-gray-500">Yükleniyor...</p>
                )}
                <p className="text-sm text-gray-500">
                  Kapak resmi yükleyin (maksimum 10MB). Kapak resmi yoksa otomatik olarak ilk 4 ürünün resimlerinden oluşturulacaktır.
                </p>
              </div>
            </div>

            {/* Public/Private */}
            <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl">
              <input
                type="checkbox"
                id="isPublic"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="w-5 h-5 text-primary-500 border-gray-300 rounded focus:ring-primary-500"
              />
              <label htmlFor="isPublic" className="text-sm font-medium text-gray-700 cursor-pointer">
                {t('collection.publicCollection')}
              </label>
            </div>
            <p className="text-sm text-gray-500 -mt-4">
              {isPublic
                ? t('collection.publicCollectionDesc')
                : t('collection.privateCollectionDesc')}
            </p>

            {/* Actions */}
            <div className="flex flex-col gap-4 pt-4 border-t border-gray-200">
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl transition-colors font-medium"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !name.trim()}
                  className="flex-1 px-6 py-3 bg-primary-500 hover:bg-primary-600 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {isSaving ? t('collection.saving') : t('collection.saveChanges')}
                </button>
              </div>
              
              {/* Delete Button */}
              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl transition-colors font-medium"
              >
                <TrashIcon className="w-5 h-5" />
                {t('collection.deleteCollection')}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-xl font-semibold mb-4 text-gray-900">
              {t('collection.deleteCollection')}
            </h2>
            <p className="text-gray-700 mb-6">
              {t('collection.deleteCollectionConfirm')}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
                className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeleting ? t('collection.deleting') : t('collection.yesDelete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

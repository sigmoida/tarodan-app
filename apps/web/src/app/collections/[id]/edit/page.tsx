'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeftIcon, TrashIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import AuthLoadingScreen from '@/components/AuthLoadingScreen';
import { collectionsApi, categoriesApi } from '@/lib/api';
import OptimizedImage from '@/components/OptimizedImage';
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
  categoryId?: string | null;
  category?: { id: string; name: string; slug: string } | null;
}

function flattenCategories(tree: { id: string; name: string; slug: string; children?: any[] }[], prefix = ''): { id: string; name: string; slug: string }[] {
  const out: { id: string; name: string; slug: string }[] = [];
  for (const c of tree) {
    out.push({ id: c.id, name: prefix ? `${prefix} ${c.name}` : c.name, slug: c.slug });
    if (c.children?.length) {
      out.push(...flattenCategories(c.children, '—'));
    }
  }
  return out;
}

// UUID format checker
const isUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

export default function EditCollectionPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
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
  const [categoryId, setCategoryId] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);
  const [coverImagePreview, setCoverImagePreview] = useState<string>('');
  const [isUploadingCover, setIsUploadingCover] = useState(false);

  const { data: categoriesTree } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await categoriesApi.findAll();
      return res.data?.data ?? res.data ?? [];
    },
  });
  const flatCategories = useMemo(
    () => (Array.isArray(categoriesTree) ? flattenCategories(categoriesTree) : []),
    [categoriesTree],
  );

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || !user) {
      router.push('/login');
      return;
    }

    if (collectionIdOrSlug) {
      fetchCollection();
    }
  }, [collectionIdOrSlug, authLoading, isAuthenticated, user]);

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
      setCategoryId(data.categoryId || '');
      setCoverImageUrl(data.coverImageUrl || '');
      setCoverImagePreview(data.coverImageUrl || '');
      setIsPublic(data.isPublic ?? true);
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') console.error('Fetch collection error:', error);
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
      if (process.env.NODE_ENV === 'development') console.error('Cover image upload error:', error);
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
        categoryId: categoryId || null,
        isPublic,
      });
      
      toast.success(t('collection.collectionUpdated'));
      // Use slug if available, otherwise use ID
      router.push(`/collections/${collection.id}`);
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') console.error('Update collection error:', error);
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
      await queryClient.invalidateQueries({ queryKey: ['collections', 'mine'] });
      await queryClient.invalidateQueries({ queryKey: ['collections'] });
      queryClient.removeQueries({ queryKey: ['collection', collection.id] });
      toast.success(t('collection.collectionDeleted'));
      router.push('/collections');
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') console.error('Delete collection error:', error);
      toast.error(error.response?.data?.message || t('collection.loadFailed'));
      setIsDeleting(false);
    }
  };

  if (authLoading) return <AuthLoadingScreen />;
  if (!authLoading && (!isAuthenticated || !user)) return null;
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-orange-500 mx-auto mb-4"></div>
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
            className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 text-sm font-medium transition-colors"
          >
            {t('collection.backToCollections')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-6 sm:px-8 py-4">
          <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-500 hover:text-gray-700 text-sm transition-colors mb-3">
            <ArrowLeftIcon className="w-4 h-4" />{t('common.back')}
          </button>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <div className="w-1 h-6 bg-orange-500 rounded-sm" />
            {t('collection.editCollectionTitle')}
          </h1>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-6 sm:px-8 py-6">

        {/* Form */}
        <div className="bg-white rounded border border-gray-200 p-6 md:p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Name */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">
                {t('collection.collectionNameLabel')}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded text-sm text-gray-900 placeholder-gray-400 bg-white focus:outline-none focus:border-orange-400"
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
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">
                {t('collection.descriptionLabel')}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded text-sm text-gray-900 placeholder-gray-400 bg-white focus:outline-none focus:border-orange-400"
                placeholder={t('collection.descriptionPlaceholder')}
                rows={5}
                maxLength={500}
              />
              <p className="mt-1 text-sm text-gray-500">
                {description.length}/500 {t('collection.characters')}
              </p>
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">
                {t('common.category')}
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded text-sm text-gray-900 bg-white focus:outline-none focus:border-orange-400"
              >
                <option value="">{t('common.none')}</option>
                {flatCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Cover Image Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Kapak Resmi
              </label>
              <div className="space-y-3">
                {coverImagePreview && (
                  <div className="relative w-full h-48 rounded overflow-hidden border border-gray-200">
                    <OptimizedImage
                      src={coverImagePreview}
                      alt="Cover preview"
                      fill
                      className="object-cover"
                      logContext={{ page: 'collection-edit-cover' }}
                    />
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleCoverImageChange}
                  disabled={isUploadingCover}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded text-sm text-gray-900 bg-white focus:outline-none focus:border-orange-400 disabled:opacity-50 disabled:cursor-not-allowed"
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
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded border border-gray-100">
              <input
                type="checkbox"
                id="isPublic"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="w-4 h-4 text-orange-500 border-gray-300 rounded focus:ring-orange-500"
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
                  className="flex-1 px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-sm font-medium transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !name.trim()}
                  className="flex-1 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? t('collection.saving') : t('collection.saveChanges')}
                </button>
              </div>
              
              {/* Delete Button */}
              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                className="flex items-center justify-center gap-2 px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded text-sm font-medium transition-colors"
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
          <div className="bg-white rounded p-6 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-bold mb-3 text-gray-900">
              {t('collection.deleteCollection')}
            </h2>
            <p className="text-gray-500 text-sm mb-5">
              {t('collection.deleteCollectionConfirm')}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

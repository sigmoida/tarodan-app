import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { collectionsApi } from '@/lib/api';
import { useTranslation } from '@/i18n/LanguageContext';
import type { Collection } from '../_lib/types';
import { isUUID } from '../_lib/constants';

export function useEditCollection() {
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
      toast.error(error.response?.data?.message || t('collection.loadFailed'));
      setIsDeleting(false);
    }
  };

  return {
    router,
    authLoading,
    isAuthenticated,
    user,
    collection,
    isLoading,
    error,
    isSaving,
    isDeleting,
    showDeleteModal,
    setShowDeleteModal,
    name,
    setName,
    description,
    setDescription,
    categoryId,
    setCategoryId,
    coverImagePreview,
    isUploadingCover,
    isPublic,
    setIsPublic,
    handleCoverImageChange,
    handleSubmit,
    handleDelete,
  };
}

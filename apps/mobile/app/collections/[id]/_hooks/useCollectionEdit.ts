import { useState, useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { appAlert } from '@tarodan/ui-native';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { collectionSchema, type CollectionForm, type Collection } from '../_lib/collectionEditSchema';

/**
 * Collection edit controller — owns the collection query, RHF form (zod), the
 * update/delete/remove-item mutations, cover-image picker, and the snackbar.
 * Lifted verbatim from the monolithic EditCollectionScreen.
 */
export function useCollectionEdit() {
  const { id } = useLocalSearchParams();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });

  // Fetch collection
  const { data: collection, isLoading } = useQuery<Collection>({
    queryKey: ['collection', id],
    queryFn: async () => {
      const response = await api.get(`/collections/${id}`);
      return response.data;
    },
    enabled: !!id,
  });

  const form = useForm<CollectionForm>({
    resolver: zodResolver(collectionSchema),
    defaultValues: {
      name: '',
      description: '',
      isPublic: true,
    },
  });
  const { reset } = form;

  // Update form when collection loads
  useEffect(() => {
    if (collection) {
      reset({
        name: collection.name,
        description: collection.description || '',
        isPublic: collection.isPublic,
      });
      setCoverImage(collection.coverImageUrl);
    }
  }, [collection, reset]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: CollectionForm) => {
      // Metin alanları JSON ile (API @Body() UpdateCollectionDto bekler, FileInterceptor yok)
      await api.patch(`/collections/${id}`, {
        name: data.name,
        description: data.description || undefined,
        isPublic: data.isPublic,
      });

      // Kapak değiştiyse ayrı multipart uca yükle (PATCH /collections/:id/cover, alan 'cover')
      if (coverImage && coverImage !== collection?.coverImageUrl) {
        const formData = new FormData();
        formData.append('cover', {
          uri: coverImage,
          type: 'image/jpeg',
          name: 'cover.jpg',
        } as any);
        await api.patch(`/collections/${id}/cover`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection', id] });
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      queryClient.invalidateQueries({ queryKey: ['my-collections'] });
      setSnackbar({ visible: true, message: 'Koleksiyon güncellendi!' });
    },
    onError: (error: any) => {
      setSnackbar({ visible: true, message: error.response?.data?.message || 'Güncelleme başarısız' });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/collections/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      queryClient.invalidateQueries({ queryKey: ['my-collections'] });
      setSnackbar({ visible: true, message: 'Koleksiyon silindi' });
      setTimeout(() => router.replace('/collections'), 1500);
    },
    onError: (error: any) => {
      setSnackbar({ visible: true, message: error.response?.data?.message || 'Silme başarısız' });
    },
  });

  // Remove item mutation
  const removeItemMutation = useMutation({
    mutationFn: (itemId: string) => api.delete(`/collections/${id}/items/${itemId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection', id] });
      setSnackbar({ visible: true, message: 'Ürün koleksiyondan kaldırıldı' });
    },
    onError: (error: any) => {
      setSnackbar({ visible: true, message: error.response?.data?.message || 'Kaldırma başarısız' });
    },
  });

  const pickCoverImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });

    if (!result.canceled) {
      setCoverImage(result.assets[0].uri);
    }
  };

  const handleDelete = () => {
    appAlert(
      'Koleksiyonu Sil',
      'Bu koleksiyonu silmek istediğinize emin misiniz? Bu işlem geri alınamaz.',
      [
        { text: 'İptal', style: 'cancel' },
        { text: 'Sil', style: 'destructive', onPress: () => deleteMutation.mutate() },
      ]
    );
  };

  const handleRemoveItem = (itemId: string, productTitle: string) => {
    appAlert(
      'Ürünü Kaldır',
      `"${productTitle}" ürününü koleksiyondan kaldırmak istediğinize emin misiniz?`,
      [
        { text: 'İptal', style: 'cancel' },
        { text: 'Kaldır', style: 'destructive', onPress: () => removeItemMutation.mutate(itemId) },
      ]
    );
  };

  const onSubmit = (data: CollectionForm) => {
    updateMutation.mutate(data);
  };

  return {
    id,
    user,
    isLoading,
    collection,
    form,
    coverImage,
    pickCoverImage,
    updateMutation,
    handleDelete,
    handleRemoveItem,
    onSubmit,
    snackbar,
    setSnackbar,
  };
}

export type CollectionEditController = ReturnType<typeof useCollectionEdit>;

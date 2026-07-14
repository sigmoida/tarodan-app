import { useState } from 'react';
import { router } from 'expo-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { collectionSchema, type CollectionForm } from '../_lib/schema';
import type { CollectionTemplate } from '../_lib/templates';

/**
 * New-collection controller — owns the RHF+zod form, cover-image pick, template
 * selection, and the create mutation (JSON create → optional multipart cover
 * upload). Lifted verbatim from the monolithic screen (§12).
 */
export function useNewCollection() {
  const { isAuthenticated, limits } = useAuthStore();
  const queryClient = useQueryClient();

  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });

  const canCreateCollections = limits?.canCreateCollections || false;

  const {
    control,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<CollectionForm>({
    resolver: zodResolver(collectionSchema),
    defaultValues: {
      name: '',
      description: '',
      isPublic: true,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: CollectionForm) => {
      // Koleksiyonu JSON ile oluştur (API @Body() CreateCollectionDto bekler, FileInterceptor yok)
      const res = await api.post('/collections', {
        name: data.name,
        description: data.description,
        isPublic: data.isPublic,
      });

      // Kapak görseli varsa dönen id ile ayrı multipart uca yükle (PATCH /collections/:id/cover, alan 'cover')
      if (coverImage) {
        const formData = new FormData();
        formData.append('cover', {
          uri: coverImage,
          type: 'image/jpeg',
          name: 'cover.jpg',
        } as any);
        await api.patch(`/collections/${res.data.id}/cover`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      return res;
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      queryClient.invalidateQueries({ queryKey: ['my-collections'] });
      setSnackbar({ visible: true, message: 'Koleksiyon oluşturuldu!' });
      setTimeout(() => router.replace(`/collections/${response.data.id}`), 1500);
    },
    onError: (error: any) => {
      setSnackbar({ visible: true, message: error.response?.data?.message || 'Koleksiyon oluşturulamadı' });
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

  const selectTemplate = (template: CollectionTemplate) => {
    setSelectedTemplate(template.id);
    if (template.id !== 'custom') {
      setValue('name', template.name);
    }
  };

  const onSubmit = (data: CollectionForm) => {
    createMutation.mutate(data);
  };

  return {
    isAuthenticated,
    canCreateCollections,
    control,
    errors,
    handleSubmit,
    watch,
    onSubmit,
    createMutation,
    coverImage,
    setCoverImage,
    pickCoverImage,
    selectedTemplate,
    selectTemplate,
    snackbar,
    setSnackbar,
  };
}

export type NewCollectionController = ReturnType<typeof useNewCollection>;

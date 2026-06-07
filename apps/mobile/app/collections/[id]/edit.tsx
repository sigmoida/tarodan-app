import { View, ScrollView, StyleSheet, TouchableOpacity, Image, Alert } from 'react-native';
import { theme, Button, Switch, Snackbar, IconButton, Spinner, Text, Input, Textarea } from '@tarodan/ui-native';
import { useState, useEffect } from 'react';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../../src/services/api';
import { useAuthStore } from '../../../src/stores/authStore';
import { resolveImageUrl } from '../../../src/utils/imageUrl';

const { colors } = theme;

const collectionSchema = z.object({
  name: z.string().min(3, 'Koleksiyon adı en az 3 karakter olmalı').max(100),
  description: z.string().max(500, 'Açıklama en fazla 500 karakter olabilir').optional(),
  isPublic: z.boolean(),
});

type CollectionForm = z.infer<typeof collectionSchema>;

interface Collection {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  coverImageUrl: string | null;
  isPublic: boolean;
  viewCount: number;
  likeCount: number;
  userId?: string;
  ownerId?: string;
  items: Array<{
    id: string;
    product: {
      id: string;
      title: string;
      images: { url: string }[];
    };
  }>;
  createdAt: string;
}

export default function EditCollectionScreen() {
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

  const { control, handleSubmit, formState: { errors }, reset, watch } = useForm<CollectionForm>({
    resolver: zodResolver(collectionSchema),
    defaultValues: {
      name: '',
      description: '',
      isPublic: true,
    },
  });

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
      const formData = new FormData();
      formData.append('name', data.name);
      if (data.description) formData.append('description', data.description);
      formData.append('isPublic', String(data.isPublic));

      if (coverImage && coverImage !== collection?.coverImageUrl) {
        formData.append('coverImage', {
          uri: coverImage,
          type: 'image/jpeg',
          name: 'cover.jpg',
        } as any);
      }

      return api.patch(`/collections/${id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
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
    Alert.alert(
      'Koleksiyonu Sil',
      'Bu koleksiyonu silmek istediğinize emin misiniz? Bu işlem geri alınamaz.',
      [
        { text: 'İptal', style: 'cancel' },
        { text: 'Sil', style: 'destructive', onPress: () => deleteMutation.mutate() },
      ]
    );
  };

  const handleRemoveItem = (itemId: string, productTitle: string) => {
    Alert.alert(
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

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Spinner size="lg" />
      </View>
    );
  }

  if (!collection) {
    return (
      <View style={styles.errorContainer}>
        <Text>Koleksiyon bulunamadı</Text>
        <Button variant="primary" title="Geri Dön" onPress={() => router.back()} />
      </View>
    );
  }

  // Check ownership
  if (collection && user && collection.userId !== user.id) {
    return (
      <View style={styles.errorContainer}>
        <Text>Bu koleksiyonu düzenleme yetkiniz yok</Text>
        <Button variant="primary" title="Geri Dön" onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Koleksiyonu Düzenle' }} />

      <ScrollView style={styles.content}>
        {/* Cover Image */}
        <TouchableOpacity style={styles.coverImageContainer} onPress={pickCoverImage}>
          {coverImage ? (
            <Image source={{ uri: coverImage }} style={styles.coverImage} />
          ) : (
            <View style={styles.coverImagePlaceholder}>
              <Ionicons name="image-outline" size={48} color={colors.text.muted} />
              <Text variant="body" style={styles.coverImageText}>
                Kapak fotoğrafı ekle
              </Text>
            </View>
          )}
          {coverImage && (
            <View style={styles.coverOverlay}>
              <Ionicons name="camera" size={24} color={colors.white} />
              <Text style={styles.coverOverlayText}>Değiştir</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Ionicons name="eye" size={20} color={colors.text.muted} />
            <Text variant="body">{collection.viewCount} görüntülenme</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="heart" size={20} color={colors.danger[600]!} />
            <Text variant="body">{collection.likeCount} beğeni</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="pricetag" size={20} color={colors.primary[600]!} />
            <Text variant="body">{collection.items?.length || 0} ürün</Text>
          </View>
        </View>

        {/* Collection Details */}
        <View style={styles.card}>
          <Text variant="h3" style={styles.sectionTitle}>Koleksiyon Bilgileri</Text>

          <Controller
            control={control}
            name="name"
            render={({ field: { onChange, value } }) => (
              <Input
                label="Koleksiyon Adı *"
                value={value}
                onChangeText={onChange}
                error={errors.name?.message}
                containerStyle={styles.input}
              />
            )}
          />

          <Controller
            control={control}
            name="description"
            render={({ field: { onChange, value } }) => (
              <Textarea
                label="Açıklama"
                value={value}
                onChangeText={onChange}
                rows={3}
                containerStyle={styles.input}
              />
            )}
          />
        </View>

        {/* Privacy Settings */}
        <View style={styles.card}>
          <Text variant="h3" style={styles.sectionTitle}>Gizlilik Ayarları</Text>

          <View style={styles.privacyOption}>
            <View style={styles.privacyInfo}>
              <Ionicons
                name={watch('isPublic') ? 'globe-outline' : 'lock-closed'}
                size={24}
                color={colors.primary[600]!}
              />
              <View style={styles.privacyText}>
                <Text variant="body">
                  {watch('isPublic') ? 'Herkese Açık' : 'Gizli'}
                </Text>
                <Text variant="bodySm" style={styles.privacyDesc}>
                  {watch('isPublic')
                    ? 'Herkes koleksiyonunuzu görebilir'
                    : 'Sadece siz görebilirsiniz'}
                </Text>
              </View>
            </View>
            <Controller
              control={control}
              name="isPublic"
              render={({ field: { onChange, value } }) => (
                <Switch value={value} onValueChange={onChange} />
              )}
            />
          </View>
        </View>

        {/* Collection Items */}
        <View style={styles.card}>
          <View style={styles.itemsHeader}>
            <Text variant="h3" style={styles.sectionTitle}>
              Koleksiyondaki Ürünler ({collection.items?.length || 0})
            </Text>
            <Button
              variant="outline"
              title="Ekle"
              onPress={() => router.push(`/collections/${id}/add-items`)}
              icon="add"
              size="sm"
            />
          </View>

          {collection.items?.length === 0 ? (
            <View style={styles.emptyItems}>
              <Ionicons name="images-outline" size={48} color={colors.gray[500]} />
              <Text variant="body" style={styles.emptyText}>
                Henüz ürün eklenmemiş
              </Text>
            </View>
          ) : (
            collection.items?.map((item) => (
              <View key={item.id} style={styles.collectionItem}>
                <TouchableOpacity
                  style={styles.itemContent}
                  onPress={() => router.push(`/product/${item.product.id}`)}
                >
                  <Image
                    source={{ uri: resolveImageUrl(item.product.images) }}
                    style={styles.itemImage}
                  />
                  <Text variant="body" style={styles.itemTitle} numberOfLines={1}>
                    {item.product.title}
                  </Text>
                </TouchableOpacity>
                <IconButton
                  icon="close"
                  accessibilityLabel="Ürünü kaldır"
                  size="sm"
                  onPress={() => handleRemoveItem(item.id, item.product.title)}
                />
              </View>
            ))
          )}
        </View>

        {/* Actions */}
        <Button
          variant="primary"
          title="Değişiklikleri Kaydet"
          onPress={handleSubmit(onSubmit)}
          isLoading={updateMutation.isPending}
          disabled={updateMutation.isPending}
          icon="checkmark"
          style={styles.saveButton}
        />

        {/* Danger Zone */}
        <View style={styles.dangerCard}>
          <Text variant="h3" style={styles.dangerTitle}>Tehlikeli Bölge</Text>
          <TouchableOpacity onPress={handleDelete} style={styles.dangerItem}>
            <Ionicons name="trash" size={24} color={colors.danger[600]!} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.dangerItemTitle}>Koleksiyonu Sil</Text>
              <Text style={styles.dangerItemDesc}>Bu işlem geri alınamaz</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={{ height: 50 }} />
      </ScrollView>

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ ...snackbar, visible: false })}
        duration={3000}
      >
        {snackbar.message}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  coverImageContainer: {
    width: '100%',
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    backgroundColor: colors.surface.DEFAULT,
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverImagePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border.DEFAULT,
    borderStyle: 'dashed',
    borderRadius: 12,
  },
  coverImageText: {
    marginTop: 8,
    color: colors.text.muted,
  },
  coverOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.overlay.black50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  coverOverlayText: {
    color: colors.white,
    marginLeft: 8,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.surface.DEFAULT,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  card: {
    marginBottom: 16,
    backgroundColor: colors.surface.DEFAULT,
    padding: 16,
    borderRadius: 12,
  },
  sectionTitle: {
    marginBottom: 16,
    color: colors.text.heading,
  },
  input: {
    marginBottom: 12,
  },
  privacyOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  privacyInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  privacyText: {
    marginLeft: 12,
  },
  privacyDesc: {
    color: colors.text.muted,
  },
  itemsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  emptyItems: {
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    marginTop: 8,
    color: colors.text.muted,
  },
  collectionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  itemImage: {
    width: 50,
    height: 50,
    borderRadius: 6,
    backgroundColor: colors.border.DEFAULT,
  },
  itemTitle: {
    flex: 1,
    marginLeft: 12,
    color: colors.text.heading,
  },
  saveButton: {
    marginBottom: 16,
  },
  dangerCard: {
    marginBottom: 16,
    backgroundColor: colors.danger[50]!,
    borderWidth: 1,
    borderColor: colors.danger[200]!,
    padding: 16,
    borderRadius: 12,
  },
  dangerTitle: {
    marginBottom: 8,
    color: colors.danger[600]!,
  },
  dangerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  dangerItemTitle: {
    color: colors.danger[600]!,
    fontWeight: '600',
  },
  dangerItemDesc: {
    color: colors.text.muted,
    fontSize: 12,
    marginTop: 2,
  },
});

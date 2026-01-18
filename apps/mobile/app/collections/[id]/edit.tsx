import { View, ScrollView, StyleSheet, TouchableOpacity, Image, Alert } from 'react-native';
import { Text, TextInput, Button, Switch, Card, Divider, Snackbar, IconButton, ActivityIndicator, List } from 'react-native-paper';
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
import { TarodanColors } from '../../../src/theme';

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
        <ActivityIndicator size="large" color={TarodanColors.primary} />
      </View>
    );
  }

  if (!collection) {
    return (
      <View style={styles.errorContainer}>
        <Text>Koleksiyon bulunamadı</Text>
        <Button mode="contained" onPress={() => router.back()}>Geri Dön</Button>
      </View>
    );
  }

  // Check ownership
  if (collection && user && collection.userId !== user.id) {
    return (
      <View style={styles.errorContainer}>
        <Text>Bu koleksiyonu düzenleme yetkiniz yok</Text>
        <Button mode="contained" onPress={() => router.back()}>Geri Dön</Button>
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
              <Ionicons name="image-outline" size={48} color={TarodanColors.textSecondary} />
              <Text variant="bodyMedium" style={styles.coverImageText}>
                Kapak fotoğrafı ekle
              </Text>
            </View>
          )}
          {coverImage && (
            <View style={styles.coverOverlay}>
              <Ionicons name="camera" size={24} color="#fff" />
              <Text style={styles.coverOverlayText}>Değiştir</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Ionicons name="eye" size={20} color={TarodanColors.textSecondary} />
            <Text variant="bodyMedium">{collection.viewCount} görüntülenme</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="heart" size={20} color={TarodanColors.error} />
            <Text variant="bodyMedium">{collection.likeCount} beğeni</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="pricetag" size={20} color={TarodanColors.primary} />
            <Text variant="bodyMedium">{collection.items?.length || 0} ürün</Text>
          </View>
        </View>

        {/* Collection Details */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>Koleksiyon Bilgileri</Text>
            
            <Controller
              control={control}
              name="name"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  label="Koleksiyon Adı *"
                  value={value}
                  onChangeText={onChange}
                  error={!!errors.name}
                  mode="outlined"
                  style={styles.input}
                />
              )}
            />
            {errors.name && (
              <Text variant="bodySmall" style={styles.errorText}>{errors.name.message}</Text>
            )}

            <Controller
              control={control}
              name="description"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  label="Açıklama"
                  value={value}
                  onChangeText={onChange}
                  multiline
                  numberOfLines={3}
                  mode="outlined"
                  style={styles.input}
                />
              )}
            />
          </Card.Content>
        </Card>

        {/* Privacy Settings */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>Gizlilik Ayarları</Text>
            
            <View style={styles.privacyOption}>
              <View style={styles.privacyInfo}>
                <Ionicons 
                  name={watch('isPublic') ? 'globe-outline' : 'lock-closed'} 
                  size={24} 
                  color={TarodanColors.primary} 
                />
                <View style={styles.privacyText}>
                  <Text variant="bodyMedium">
                    {watch('isPublic') ? 'Herkese Açık' : 'Gizli'}
                  </Text>
                  <Text variant="bodySmall" style={styles.privacyDesc}>
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
          </Card.Content>
        </Card>

        {/* Collection Items */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.itemsHeader}>
              <Text variant="titleMedium" style={styles.sectionTitle}>
                Koleksiyondaki Ürünler ({collection.items?.length || 0})
              </Text>
              <Button 
                mode="outlined" 
                compact 
                onPress={() => router.push(`/collections/${id}/add-items`)}
                icon="plus"
              >
                Ekle
              </Button>
            </View>
            
            {collection.items?.length === 0 ? (
              <View style={styles.emptyItems}>
                <Ionicons name="images-outline" size={48} color={TarodanColors.textLight} />
                <Text variant="bodyMedium" style={styles.emptyText}>
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
                      source={{ uri: item.product.images?.[0]?.url || 'https://via.placeholder.com/50' }}
                      style={styles.itemImage}
                    />
                    <Text variant="bodyMedium" style={styles.itemTitle} numberOfLines={1}>
                      {item.product.title}
                    </Text>
                  </TouchableOpacity>
                  <IconButton
                    icon="close"
                    size={20}
                    onPress={() => handleRemoveItem(item.id, item.product.title)}
                  />
                </View>
              ))
            )}
          </Card.Content>
        </Card>

        {/* Actions */}
        <Button
          mode="contained"
          onPress={handleSubmit(onSubmit)}
          loading={updateMutation.isPending}
          disabled={updateMutation.isPending}
          style={styles.saveButton}
          icon="check"
        >
          Değişiklikleri Kaydet
        </Button>

        {/* Danger Zone */}
        <Card style={styles.dangerCard}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.dangerTitle}>Tehlikeli Bölge</Text>
            <List.Item
              title="Koleksiyonu Sil"
              description="Bu işlem geri alınamaz"
              titleStyle={{ color: TarodanColors.error }}
              left={props => <List.Icon {...props} icon="delete" color={TarodanColors.error} />}
              onPress={handleDelete}
            />
          </Card.Content>
        </Card>

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
    backgroundColor: TarodanColors.backgroundSecondary,
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
    backgroundColor: TarodanColors.background,
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
    borderColor: TarodanColors.border,
    borderStyle: 'dashed',
    borderRadius: 12,
  },
  coverImageText: {
    marginTop: 8,
    color: TarodanColors.textSecondary,
  },
  coverOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  coverOverlayText: {
    color: '#fff',
    marginLeft: 8,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: TarodanColors.background,
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
    backgroundColor: TarodanColors.background,
  },
  sectionTitle: {
    marginBottom: 16,
    color: TarodanColors.textPrimary,
  },
  input: {
    marginBottom: 12,
    backgroundColor: TarodanColors.background,
  },
  errorText: {
    color: TarodanColors.error,
    marginBottom: 8,
    marginTop: -8,
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
    color: TarodanColors.textSecondary,
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
    color: TarodanColors.textSecondary,
  },
  collectionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: TarodanColors.border,
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
    backgroundColor: TarodanColors.border,
  },
  itemTitle: {
    flex: 1,
    marginLeft: 12,
    color: TarodanColors.textPrimary,
  },
  saveButton: {
    marginBottom: 16,
    backgroundColor: TarodanColors.primary,
    borderRadius: 8,
  },
  dangerCard: {
    marginBottom: 16,
    backgroundColor: TarodanColors.error + '08',
    borderWidth: 1,
    borderColor: TarodanColors.error + '30',
  },
  dangerTitle: {
    marginBottom: 8,
    color: TarodanColors.error,
  },
});

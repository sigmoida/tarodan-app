import { View, ScrollView, Image, StyleSheet, Alert, Pressable } from 'react-native';
import {
  Button,
  Switch,
  Snackbar,
  IconButton,
  Chip,
  Spinner,
  Input,
  Textarea,
  Text,
  theme,
} from '@tarodan/ui-native';
import { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../../src/services/api';
import { useAuthStore } from '../../../src/stores/authStore';
import { CommissionPreview } from '../../../src/components/common';

const { colors } = theme;

const listingSchema = z.object({
  title: z.string().min(5, 'Başlık en az 5 karakter olmalı').max(200, 'Başlık en fazla 200 karakter olabilir'),
  description: z.string().max(5000, 'Açıklama en fazla 5000 karakter olabilir').optional(),
  price: z.string().refine(val => !isNaN(Number(val)) && Number(val) >= 1, 'Fiyat en az 1 TL olmalı'),
  brand: z.string().min(1, 'Marka seçin'),
  scale: z.string().min(1, 'Ölçek seçin'),
  condition: z.string().min(1, 'Durum seçin'),
  categoryId: z.string().min(1, 'Kategori seçin'),
  isTradeEnabled: z.boolean(),
});

type ListingForm = z.infer<typeof listingSchema>;

const BRANDS = [
  { id: 'hot-wheels', name: 'Hot Wheels' },
  { id: 'matchbox', name: 'Matchbox' },
  { id: 'majorette', name: 'Majorette' },
  { id: 'tomica', name: 'Tomica' },
  { id: 'minichamps', name: 'Minichamps' },
  { id: 'autoart', name: 'AutoArt' },
  { id: 'maisto', name: 'Maisto' },
  { id: 'bburago', name: 'Bburago' },
  { id: 'welly', name: 'Welly' },
  { id: 'other', name: 'Diğer' },
];

const SCALES = [
  { id: '1:18', name: '1:18' },
  { id: '1:24', name: '1:24' },
  { id: '1:32', name: '1:32' },
  { id: '1:43', name: '1:43' },
  { id: '1:64', name: '1:64' },
  { id: '1:72', name: '1:72' },
  { id: '1:87', name: '1:87' },
  { id: 'other', name: 'Diğer' },
];

const CONDITIONS = [
  { id: 'new', name: 'Sıfır' },
  { id: 'like_new', name: 'Sıfır Gibi' },
  { id: 'very_good', name: 'Mükemmel' },
  { id: 'good', name: 'İyi' },
  { id: 'fair', name: 'Orta' },
];

interface Category {
  id: string;
  name: string;
  slug: string;
}

export default function EditListingScreen() {
  const { id } = useLocalSearchParams();
  const queryClient = useQueryClient();
  const { limits } = useAuthStore();
  const [images, setImages] = useState<string[]>([]);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  const maxImages = limits?.maxImagesPerListing || 5;
  const canTrade = limits?.canTrade || false;

  // Fetch listing data
  const { data: listing, isLoading: listingLoading } = useQuery({
    queryKey: ['listing', id],
    queryFn: async () => {
      try {
        const response = await api.get(`/products/${id}`);
        return response.data;
      } catch (error) {
        console.log('Failed to fetch listing');
        return null;
      }
    },
    enabled: !!id,
  });

  // Fetch categories
  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      try {
        const response = await api.get('/categories');
        return response.data?.data || response.data || [];
      } catch (error) {
        return [
          { id: 'sports', name: 'Spor Arabalar', slug: 'sports' },
          { id: 'classic', name: 'Klasik', slug: 'classic' },
          { id: 'trucks', name: 'Kamyonlar', slug: 'trucks' },
          { id: 'racing', name: 'Yarış', slug: 'racing' },
          { id: 'vintage', name: 'Vintage', slug: 'vintage' },
        ];
      }
    },
  });

  const categories: Category[] = categoriesData || [];

  const { control, handleSubmit, formState: { errors }, setValue, watch, reset } = useForm<ListingForm>({
    resolver: zodResolver(listingSchema),
    defaultValues: {
      title: '',
      description: '',
      price: '',
      brand: '',
      scale: '1:64',
      condition: 'very_good',
      categoryId: '',
      isTradeEnabled: false,
    },
  });

  // Populate form when listing data loads
  useEffect(() => {
    if (listing) {
      reset({
        title: listing.title || '',
        description: listing.description || '',
        price: listing.price?.toString() || '',
        brand: listing.brand || '',
        scale: listing.scale || '1:64',
        condition: listing.condition || 'very_good',
        categoryId: listing.categoryId || listing.category?.id || '',
        isTradeEnabled: listing.isTradeEnabled || false,
      });
      setSelectedCategory(listing.categoryId || listing.category?.id || '');
      if (listing.images && listing.images.length > 0) {
        setImages(listing.images.map((img: any) => img.url || img));
      }
    }
  }, [listing, reset]);

  const updateMutation = useMutation({
    mutationFn: async (data: ListingForm) => {
      const payload = {
        title: data.title,
        description: data.description || undefined,
        price: parseFloat(data.price),
        categoryId: data.categoryId,
        condition: data.condition,
        brand: data.brand,
        scale: data.scale,
        isTradeEnabled: data.isTradeEnabled,
        imageUrls: images.length > 0 ? images : undefined,
      };

      return api.patch(`/products/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['my-listings'] });
      queryClient.invalidateQueries({ queryKey: ['listing', id] });
      setSnackbar({ visible: true, message: 'İlan başarıyla güncellendi!' });
      setTimeout(() => router.back(), 1500);
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'İlan güncellenemedi';
      setSnackbar({ visible: true, message });
    },
  });

  const pickImage = async () => {
    if (images.length >= maxImages) {
      setSnackbar({ visible: true, message: `En fazla ${maxImages} fotoğraf ekleyebilirsiniz` });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: maxImages - images.length,
      quality: 0.8,
    });

    if (!result.canceled) {
      const newImages = result.assets.map(asset => asset.uri);
      setImages([...images, ...newImages].slice(0, maxImages));
    }
  };

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const handleTradeToggle = (value: boolean) => {
    if (value && !canTrade) {
      Alert.alert('Premium Özellik', 'Takas özelliği Premium üyelere özeldir.');
      return;
    }
    setValue('isTradeEnabled', value);
  };

  const onSubmit = (data: ListingForm) => {
    if (images.length === 0) {
      setSnackbar({ visible: true, message: 'En az bir fotoğraf ekleyin' });
      return;
    }
    updateMutation.mutate(data);
  };

  if (listingLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Spinner size="lg" />
        <Text style={{ marginTop: 16 }}>İlan yükleniyor...</Text>
      </View>
    );
  }

  if (!listing) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="alert-circle-outline" size={64} color={colors.danger[600]!} />
        <Text style={{ marginTop: 16 }}>İlan bulunamadı</Text>
        <Button variant="primary" onPress={() => router.back()} style={{ marginTop: 16 }}>
          Geri Dön
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Geri">
          <Ionicons name="arrow-back" size={24} color={colors.white} />
        </Pressable>
        <Text style={styles.headerTitle}>İlanı Düzenle</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content}>
        {/* Images */}
        <Text style={styles.sectionTitle}>Fotoğraflar</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageScrollView}>
          {images.map((uri, index) => (
            <View key={index} style={styles.imageContainer}>
              <Image source={{ uri }} style={styles.image} />
              {index === 0 && (
                <View style={styles.coverBadge}>
                  <Text style={styles.coverBadgeText}>Kapak</Text>
                </View>
              )}
              <IconButton
                icon="close-circle"
                size="sm"
                color={colors.white}
                style={styles.removeImageButton}
                onPress={() => removeImage(index)}
                accessibilityLabel="Fotoğrafı kaldır"
              />
            </View>
          ))}
          {images.length < maxImages && (
            <Pressable style={styles.addImageButton} onPress={pickImage}>
              <Ionicons name="add" size={32} color={colors.primary[600]!} />
              <Text style={styles.addImageText}>Ekle</Text>
            </Pressable>
          )}
        </ScrollView>
        <Text style={styles.imageCounter}>{images.length}/{maxImages} fotoğraf</Text>

        {/* Title */}
        <Controller
          control={control}
          name="title"
          render={({ field: { onChange, value } }) => (
            <Input
              label="Başlık *"
              value={value}
              onChangeText={onChange}
              error={errors.title ? ' ' : undefined}
              maxLength={200}
              containerStyle={styles.input}
            />
          )}
        />
        {errors.title && <Text style={styles.errorText}>{errors.title.message}</Text>}

        {/* Description */}
        <Controller
          control={control}
          name="description"
          render={({ field: { onChange, value } }) => (
            <Textarea
              label="Açıklama"
              value={value}
              onChangeText={onChange}
              rows={4}
              maxLength={5000}
              containerStyle={styles.input}
            />
          )}
        />

        {/* Price */}
        <Controller
          control={control}
          name="price"
          render={({ field: { onChange, value } }) => (
            <Input
              label="Fiyat (₺) *"
              value={value}
              onChangeText={onChange}
              keyboardType="numeric"
              error={errors.price ? ' ' : undefined}
              containerStyle={styles.input}
            />
          )}
        />
        {errors.price && <Text style={styles.errorText}>{errors.price.message}</Text>}
        <CommissionPreview amount={watch('price')} categoryId={watch('categoryId')} />

        {/* Category */}
        <Text style={styles.fieldLabel}>Kategori *</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScrollView}>
          {categories.map((cat) => (
            <View key={cat.id} style={styles.chipWrap}>
              <Chip
                label={cat.name}
                selected={selectedCategory === cat.id}
                onPress={() => {
                  setSelectedCategory(cat.id);
                  setValue('categoryId', cat.id);
                }}
              />
            </View>
          ))}
        </ScrollView>

        {/* Brand */}
        <Text style={styles.fieldLabel}>Marka *</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScrollView}>
          {BRANDS.map((brand) => (
            <View key={brand.id} style={styles.chipWrap}>
              <Chip
                label={brand.name}
                selected={watch('brand') === brand.id}
                onPress={() => setValue('brand', brand.id)}
              />
            </View>
          ))}
        </ScrollView>

        {/* Scale */}
        <Text style={styles.fieldLabel}>Ölçek *</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScrollView}>
          {SCALES.map((scale) => (
            <View key={scale.id} style={styles.chipWrap}>
              <Chip
                label={scale.name}
                selected={watch('scale') === scale.id}
                onPress={() => setValue('scale', scale.id)}
              />
            </View>
          ))}
        </ScrollView>

        {/* Condition */}
        <Text style={styles.fieldLabel}>Durum *</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScrollView}>
          {CONDITIONS.map((condition) => (
            <View key={condition.id} style={styles.chipWrap}>
              <Chip
                label={condition.name}
                selected={watch('condition') === condition.id}
                onPress={() => setValue('condition', condition.id)}
              />
            </View>
          ))}
        </ScrollView>

        {/* Trade Available */}
        <View style={styles.tradeSection}>
          <View style={styles.tradeContent}>
            <Text style={styles.tradeTitle}>Takas Kabul</Text>
            <Text style={styles.tradeSubtitle}>
              {canTrade ? 'Takas tekliflerine açık mısınız?' : 'Premium üyelere özel'}
            </Text>
          </View>
          <Controller
            control={control}
            name="isTradeEnabled"
            render={({ field: { value } }) => (
              <Switch
                value={value}
                onValueChange={handleTradeToggle}
                disabled={!canTrade}
              />
            )}
          />
        </View>

        {/* Submit */}
        <Button
          variant="primary"
          onPress={handleSubmit(onSubmit)}
          isLoading={updateMutation.isPending}
          disabled={updateMutation.isPending}
          fullWidth
          style={styles.submitButton}
        >
          Değişiklikleri Kaydet
        </Button>

        <Button
          variant="ghost"
          onPress={() => router.back()}
          fullWidth
          style={styles.cancelButton}
        >
          İptal
        </Button>

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
    backgroundColor: colors.white,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    backgroundColor: colors.primary[600]!,
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.white,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  imageScrollView: {
    marginBottom: 8,
  },
  imageContainer: {
    marginRight: 12,
    position: 'relative',
  },
  image: {
    width: 100,
    height: 100,
    borderRadius: 8,
  },
  coverBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: colors.primary[600]!,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  coverBadgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: 'bold',
  },
  removeImageButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: colors.overlay.black50,
  },
  addImageButton: {
    width: 100,
    height: 100,
    borderWidth: 2,
    borderColor: colors.border.DEFAULT,
    borderStyle: 'dashed',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addImageText: {
    fontSize: 12,
  },
  imageCounter: {
    color: colors.text.muted,
    marginBottom: 16,
    fontSize: 12,
  },
  input: {
    marginBottom: 8,
  },
  errorText: {
    color: colors.danger[600]!,
    fontSize: 12,
    marginBottom: 8,
  },
  fieldLabel: {
    marginTop: 16,
    marginBottom: 8,
    fontSize: 14,
    fontWeight: '600',
  },
  chipScrollView: {
    marginBottom: 8,
  },
  chipWrap: {
    marginRight: 8,
    marginBottom: 8,
  },
  tradeSection: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.white,
    borderRadius: 8,
    marginTop: 16,
    marginBottom: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.DEFAULT,
  },
  tradeContent: {
    flex: 1,
  },
  tradeTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  tradeSubtitle: {
    color: colors.text.muted,
    fontSize: 12,
  },
  submitButton: {
    marginTop: 16,
  },
  cancelButton: {
    marginTop: 8,
  },
});

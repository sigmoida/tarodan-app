import { View, ScrollView, Image, StyleSheet, Alert, TouchableOpacity, Platform } from 'react-native';
import { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import {
  Alert as UIAlert,
  Button,
  Card,
  Chip,
  IconButton,
  Input,
  Modal,
  ProgressBar,
  Snackbar,
  Switch,
  Text,
  VStack,
  theme,
} from '@tarodan/ui-native';
import { productsApi, categoriesApi, uploadApi } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';
import { CommissionPreview } from '../../src/components/common';
import { getUpgradeMessage } from '../../src/utils/membershipLimits';

const { colors, spacing, radius } = theme;

const listingSchema = z.object({
  title: z.string().min(5, 'Başlık en az 5 karakter olmalı').max(200, 'Başlık en fazla 200 karakter olabilir'),
  description: z.string().max(5000, 'Açıklama en fazla 5000 karakter olabilir').optional(),
  price: z.string().refine((val) => !isNaN(Number(val)) && Number(val) >= 1, 'Fiyat en az 1 TL olmalı'),
  brand: z.string().min(1, 'Marka seçin'),
  scale: z.string().min(1, 'Ölçek seçin'),
  condition: z.string().min(1, 'Durum seçin'),
  categoryId: z.string().min(1, 'Kategori seçin'),
  year: z.string().optional(),
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
  { id: 'new', name: 'Sıfır', description: 'Hiç açılmamış, orijinal ambalajında' },
  { id: 'like_new', name: 'Sıfır Gibi', description: 'Açılmış ama hiç kullanılmamış' },
  { id: 'very_good', name: 'Mükemmel', description: 'Minimal kullanım izi, çok iyi durumda' },
  { id: 'good', name: 'İyi', description: 'Normal kullanım izleri mevcut' },
  { id: 'fair', name: 'Orta', description: 'Görünür kullanım izleri var' },
];

interface Category {
  id: string;
  name: string;
  slug: string;
  children?: Category[];
}

export default function CreateScreen() {
  const queryClient = useQueryClient();
  const { isAuthenticated, user, limits, canCreateListing, getRemainingListings, refreshUserData } =
    useAuthStore();
  const [images, setImages] = useState<string[]>([]);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<
    'listingLimit' | 'tradeFeature' | 'imageLimit'
  >('listingLimit');
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  const maxImages = limits?.maxImagesPerListing || 5;
  const remainingListings = getRemainingListings();
  const canCreate = canCreateListing();

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      try {
        const response = await categoriesApi.getAll();
        return response.data?.data || response.data || [];
      } catch (error) {
        console.log('Categories fetch error, using defaults');
        return [
          { id: 'sports', name: 'Spor Arabalar', slug: 'sports' },
          { id: 'classic', name: 'Klasik', slug: 'classic' },
          { id: 'trucks', name: 'Kamyonlar', slug: 'trucks' },
          { id: 'racing', name: 'Yarış', slug: 'racing' },
          { id: 'vintage', name: 'Vintage', slug: 'vintage' },
          { id: 'muscle', name: 'Muscle', slug: 'muscle' },
          { id: 'other', name: 'Diğer', slug: 'other' },
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
      year: '',
      isTradeEnabled: false,
    },
  });

  const canTrade = limits?.canTrade || false;
  const watchPrice = watch('price');
  const watchCategory = watch('categoryId');

  useEffect(() => {
    if (isAuthenticated) {
      refreshUserData();
    }
  }, [isAuthenticated, refreshUserData]);

  const createMutation = useMutation({
    mutationFn: async (data: ListingForm) => {
      const uploadedImageUrls: string[] = [];
      for (const uri of images) {
        try {
          const formData = new FormData();
          const filename = uri.split('/').pop() || `image_${Date.now()}.jpg`;
          const match = /\.(\w+)$/.exec(filename);
          const type = match ? `image/${match[1]}` : 'image/jpeg';
          formData.append('file', {
            uri: Platform.OS === 'ios' ? uri.replace('file://', '') : uri,
            type,
            name: filename,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);
          const uploadResponse = await uploadApi.image(formData);
          if (uploadResponse.key || uploadResponse.url) {
            uploadedImageUrls.push(uploadResponse.key || uploadResponse.url);
          }
        } catch (uploadError) {
          console.error('Image upload error:', uploadError);
        }
      }
      if (uploadedImageUrls.length === 0 && images.length > 0) {
        throw new Error('Fotoğraflar yüklenemedi. Lütfen tekrar deneyin.');
      }
      const payload = {
        title: data.title,
        description: data.description || undefined,
        price: parseFloat(data.price),
        categoryId: data.categoryId,
        condition: data.condition,
        brand: data.brand,
        scale: data.scale,
        isTradeEnabled: data.isTradeEnabled,
        imageUrls: uploadedImageUrls.length > 0 ? uploadedImageUrls : undefined,
      };
      return productsApi.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['my-listings'] });
      refreshUserData();
      setSnackbar({ visible: true, message: 'İlan başarıyla oluşturuldu! Onay bekliyor.' });
      reset();
      setImages([]);
      setSelectedCategory('');
      setTimeout(() => router.push('/settings/my-listings'), 1500);
    },
    onError: (error: unknown) => {
      const e = error as { response?: { data?: { message?: string } }; message?: string };
      const message = e.response?.data?.message || e.message || 'İlan oluşturulamadı';
      setSnackbar({ visible: true, message });
    },
  });

  const pickImage = async () => {
    if (images.length >= maxImages) {
      if (limits?.maxImagesPerListing === 5 && user?.membershipTier === 'free') {
        setUpgradeReason('imageLimit');
        setShowUpgradeDialog(true);
      } else {
        setSnackbar({ visible: true, message: `En fazla ${maxImages} fotoğraf ekleyebilirsiniz` });
      }
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: maxImages - images.length,
      quality: 0.8,
    });
    if (!result.canceled) {
      const newImages = result.assets.map((asset) => asset.uri);
      setImages([...images, ...newImages].slice(0, maxImages));
    }
  };

  const takePhoto = async () => {
    if (images.length >= maxImages) return;
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled) {
      setImages([...images, result.assets[0].uri].slice(0, maxImages));
    }
  };

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const handleTradeToggle = (value: boolean) => {
    if (value && !canTrade) {
      setUpgradeReason('tradeFeature');
      setShowUpgradeDialog(true);
      return;
    }
    setValue('isTradeEnabled', value);
  };

  const onSubmit = (data: ListingForm) => {
    if (!canCreate) {
      setUpgradeReason('listingLimit');
      setShowUpgradeDialog(true);
      return;
    }
    if (images.length === 0) {
      setSnackbar({ visible: true, message: 'En az bir fotoğraf ekleyin' });
      return;
    }
    const price = parseFloat(data.price);
    const maxValue = limits?.maxValuePerListing || 5000;
    if (maxValue > 0 && price > maxValue && !user?.isVerified) {
      Alert.alert(
        'Fiyat Limiti',
        `Doğrulanmamış üyeler en fazla ${maxValue.toLocaleString('tr-TR')} TL değerinde ilan verebilir. Profil doğrulamanızı tamamlayın.`,
        [{ text: 'Tamam' }],
      );
      return;
    }
    createMutation.mutate(data);
  };

  if (!isAuthenticated) {
    return (
      <View style={styles.centeredContainer}>
        <Ionicons name="add-circle-outline" size={64} color={colors.primary[600]!} />
        <Text variant="h2" style={{ marginTop: spacing[4], marginBottom: spacing[2] }}>
          Giriş Yapın
        </Text>
        <Text
          variant="body"
          tone="muted"
          align="center"
          style={{ marginBottom: spacing[6], paddingHorizontal: spacing[4] }}
        >
          İlan vermek için giriş yapmanız gerekiyor
        </Text>
        <Button
          variant="primary"
          size="lg"
          fullWidth
          title="Giriş Yap"
          onPress={() => router.push('/(auth)/login')}
          style={{ marginBottom: spacing[2] }}
        />
        <Button
          variant="ghost"
          fullWidth
          title="Hesabınız yok mu? Kayıt olun"
          onPress={() => router.push('/(auth)/register')}
        />
      </View>
    );
  }

  if (!canCreate) {
    return (
      <View style={styles.centeredContainer}>
        <Ionicons name="alert-circle-outline" size={64} color={colors.warning[600]!} />
        <Text variant="h2" style={{ marginTop: spacing[4], marginBottom: spacing[2] }}>
          İlan Limitine Ulaştınız
        </Text>
        <Text variant="body" tone="muted" align="center" style={{ marginBottom: spacing[6] }}>
          Ücretsiz üye olarak en fazla {limits?.maxListings || 10} ilan verebilirsiniz. Sınırsız ilan
          için Premium üyeliğe geçin.
        </Text>
        <Card style={styles.upgradeCard}>
          <Text variant="h3" tone="primary" style={{ marginBottom: spacing[2] }}>
            Premium Avantajları
          </Text>
          {[
            'Sınırsız ilan verme',
            '15 fotoğraf yükleme',
            'Takas özelliği',
            'Dijital Garaj',
          ].map((b) => (
            <View key={b} style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success[600]!} />
              <Text variant="body" style={{ marginLeft: spacing[2] }}>
                {b}
              </Text>
            </View>
          ))}
        </Card>
        <Button
          variant="primary"
          size="lg"
          fullWidth
          title="Premium'a Geç - 99 TL/ay"
          onPress={() => router.push('/upgrade')}
          style={{ marginTop: spacing[4] }}
        />
        <Button
          variant="ghost"
          fullWidth
          title="Mevcut ilanlarımı görüntüle"
          onPress={() => router.push('/settings/my-listings')}
        />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.surface.alt }]}>
      <View style={styles.content}>
        {remainingListings !== -1 && remainingListings <= 3 && (
          <UIAlert variant="warning" style={{ marginBottom: spacing[4] }}>
            {remainingListings === 0
              ? 'İlan limitinize ulaştınız!'
              : `Kalan ilan hakkınız: ${remainingListings}/${limits?.maxListings || 10}`}
          </UIAlert>
        )}

        <Card style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text variant="label">İlan Kullanımı</Text>
            <Text variant="bodySm" tone="muted">
              {user?.listingCount || 0}/{limits?.maxListings === -1 ? '∞' : limits?.maxListings || 10}
            </Text>
          </View>
          {limits?.maxListings !== -1 && (
            <ProgressBar
              progress={(user?.listingCount || 0) / (limits?.maxListings || 10)}
              color={remainingListings <= 2 ? colors.warning[600]! : colors.primary[600]!}
              height={8}
              style={{ marginTop: spacing[2] }}
            />
          )}
        </Card>

        <Text variant="h3" style={styles.sectionTitle}>
          Fotoğraflar *
        </Text>
        <Text variant="bodySm" tone="muted" style={styles.sectionSubtitle}>
          İlk fotoğraf kapak fotoğrafı olacak. Ücretsiz üyeler {maxImages} fotoğraf yükleyebilir.
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageScrollView}>
          {images.map((uri, index) => (
            <View key={index} style={styles.imageContainer}>
              <Image source={{ uri }} style={styles.image} />
              {index === 0 && (
                <View style={styles.coverBadge}>
                  <Text variant="caption" tone="inverted" weight="bold">
                    Kapak
                  </Text>
                </View>
              )}
              <IconButton
                icon="close-circle"
                accessibilityLabel="Fotoğrafı sil"
                size="sm"
                color={colors.white}
                style={styles.removeImageButton}
                onPress={() => removeImage(index)}
              />
            </View>
          ))}
          {images.length < maxImages && (
            <View style={styles.addImageButtons}>
              <TouchableOpacity style={styles.addImageButton} onPress={pickImage}>
                <Ionicons name="images-outline" size={32} color={colors.primary[600]!} />
                <Text variant="caption">Galeri</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addImageButton} onPress={takePhoto}>
                <Ionicons name="camera-outline" size={32} color={colors.primary[600]!} />
                <Text variant="caption">Kamera</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
        <Text variant="caption" tone="muted" style={{ marginBottom: spacing[4] }}>
          {images.length}/{maxImages} fotoğraf
        </Text>

        <Controller
          control={control}
          name="title"
          render={({ field: { onChange, value } }) => (
            <Input
              label="Başlık *"
              value={value}
              onChangeText={onChange}
              error={errors.title?.message}
              placeholder="Örn: Hot Wheels 1967 Ford Mustang"
              maxLength={200}
            />
          )}
        />

        <Controller
          control={control}
          name="description"
          render={({ field: { onChange, value } }) => (
            <Input
              label="Açıklama"
              value={value}
              onChangeText={onChange}
              multiline
              numberOfLines={4}
              placeholder="Ürün hakkında detaylı bilgi verin..."
              maxLength={5000}
              style={{ minHeight: 96, textAlignVertical: 'top' }}
            />
          )}
        />

        <Controller
          control={control}
          name="price"
          render={({ field: { onChange, value } }) => (
            <Input
              label="Fiyat (₺) *"
              value={value}
              onChangeText={onChange}
              keyboardType="numeric"
              error={errors.price?.message}
              leftIconName="cash-outline"
            />
          )}
        />
        {!user?.isVerified && (
          <Text variant="bodySm" tone="warning" style={{ marginBottom: spacing[4] }}>
            Doğrulanmamış üyeler en fazla{' '}
            {(limits?.maxValuePerListing || 5000).toLocaleString('tr-TR')} TL değerinde ilan verebilir
          </Text>
        )}
        <CommissionPreview amount={watchPrice} categoryId={watchCategory} />

        <Text variant="label" style={styles.fieldLabel}>
          Kategori *
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScrollView}>
          {categories.map((cat) => (
            <Chip
              key={cat.id}
              label={cat.name}
              selected={selectedCategory === cat.id}
              onPress={() => {
                setSelectedCategory(cat.id);
                setValue('categoryId', cat.id);
              }}
              style={styles.chip}
            />
          ))}
        </ScrollView>
        {errors.categoryId && (
          <Text variant="bodySm" tone="danger">
            {errors.categoryId.message}
          </Text>
        )}

        <Text variant="label" style={styles.fieldLabel}>
          Marka *
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScrollView}>
          {BRANDS.map((brand) => (
            <Chip
              key={brand.id}
              label={brand.name}
              selected={watch('brand') === brand.id}
              onPress={() => setValue('brand', brand.id)}
              style={styles.chip}
            />
          ))}
        </ScrollView>
        {errors.brand && (
          <Text variant="bodySm" tone="danger">
            {errors.brand.message}
          </Text>
        )}

        <Text variant="label" style={styles.fieldLabel}>
          Ölçek *
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScrollView}>
          {SCALES.map((scale) => (
            <Chip
              key={scale.id}
              label={scale.name}
              selected={watch('scale') === scale.id}
              onPress={() => setValue('scale', scale.id)}
              style={styles.chip}
            />
          ))}
        </ScrollView>
        {errors.scale && (
          <Text variant="bodySm" tone="danger">
            {errors.scale.message}
          </Text>
        )}

        <Text variant="label" style={styles.fieldLabel}>
          Durum *
        </Text>
        {CONDITIONS.map((condition) => {
          const isSelected = watch('condition') === condition.id;
          return (
            <TouchableOpacity
              key={condition.id}
              style={[styles.conditionOption, isSelected && styles.conditionOptionSelected]}
              onPress={() => setValue('condition', condition.id)}
            >
              <View style={styles.conditionContent}>
                <Text
                  variant="body"
                  tone={isSelected ? 'primary' : 'heading'}
                  weight={isSelected ? 'semibold' : 'regular'}
                >
                  {condition.name}
                </Text>
                <Text variant="bodySm" tone="muted" style={{ marginTop: 2 }}>
                  {condition.description}
                </Text>
              </View>
              {isSelected && (
                <Ionicons name="checkmark-circle" size={24} color={colors.primary[600]!} />
              )}
            </TouchableOpacity>
          );
        })}
        {errors.condition && (
          <Text variant="bodySm" tone="danger">
            {errors.condition.message}
          </Text>
        )}

        <View style={styles.tradeSection}>
          <View style={styles.tradeContent}>
            <Text variant="label">Takas Kabul</Text>
            <Text variant="bodySm" tone="muted">
              {canTrade
                ? 'Takas tekliflerine açık mısınız?'
                : 'Bu özellik Premium üyelere özeldir'}
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
          {!canTrade && (
            <TouchableOpacity
              onPress={() => {
                setUpgradeReason('tradeFeature');
                setShowUpgradeDialog(true);
              }}
            >
              <Ionicons
                name="lock-closed"
                size={20}
                color={colors.warning[600]!}
                style={{ marginLeft: spacing[2] }}
              />
            </TouchableOpacity>
          )}
        </View>

        <Button
          variant="primary"
          size="lg"
          fullWidth
          title="İlanı Yayınla"
          onPress={handleSubmit(onSubmit)}
          isLoading={createMutation.isPending}
          disabled={createMutation.isPending}
          style={{ marginTop: spacing[2] }}
        />
        <Text variant="bodySm" tone="muted" align="center" style={{ marginTop: spacing[2] }}>
          İlanınız yayınlanmadan önce moderatör onayına tabi tutulacaktır.
        </Text>

        <View style={{ height: 100 }} />
      </View>

      <Modal
        isOpen={showUpgradeDialog}
        onClose={() => setShowUpgradeDialog(false)}
        title={getUpgradeMessage(upgradeReason).title}
      >
        <VStack gap={2}>
          <Text variant="body">{getUpgradeMessage(upgradeReason).message}</Text>
          <Text variant="label" style={{ marginTop: spacing[4] }}>
            Premium Avantajları:
          </Text>
          {[
            '• Sınırsız ilan',
            '• 15 fotoğraf yükleme',
            '• Takas özelliği',
            '• Dijital Garaj',
            '• Reklamsız deneyim',
          ].map((b) => (
            <Text key={b} variant="bodySm">
              {b}
            </Text>
          ))}
          <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[4] }}>
            <Button
              variant="ghost"
              title="Vazgeç"
              onPress={() => setShowUpgradeDialog(false)}
              style={{ flex: 1 }}
            />
            <Button
              variant="primary"
              title="Premium'a Geç"
              onPress={() => {
                setShowUpgradeDialog(false);
                router.push('/upgrade');
              }}
              style={{ flex: 1 }}
            />
          </View>
        </VStack>
      </Modal>

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ ...snackbar, visible: false })}
        duration={3000}
      >
        {snackbar.message}
      </Snackbar>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing[4] },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing[8],
    backgroundColor: colors.surface.DEFAULT,
  },
  upgradeCard: {
    marginVertical: spacing[4],
    width: '100%',
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing[1],
  },
  progressCard: {
    marginBottom: spacing[4],
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing[2],
  },
  sectionTitle: { marginBottom: spacing[1] },
  sectionSubtitle: { marginBottom: spacing[3] },
  imageScrollView: { marginBottom: spacing[2] },
  imageContainer: {
    marginRight: spacing[3],
    position: 'relative',
  },
  image: {
    width: 120,
    height: 120,
    borderRadius: radius.xl,
  },
  coverBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: colors.primary[600]!,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: radius.md,
  },
  removeImageButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: colors.gray[800],
  },
  addImageButtons: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  addImageButton: {
    width: 100,
    height: 100,
    borderWidth: 2,
    borderColor: colors.border.DEFAULT,
    borderStyle: 'dashed',
    borderRadius: radius.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fieldLabel: {
    marginTop: spacing[4],
    marginBottom: spacing[2],
  },
  chipScrollView: { marginBottom: spacing[2] },
  chip: { marginRight: spacing[2] },
  conditionOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[3],
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
    borderRadius: radius.xl,
    marginBottom: spacing[2],
    backgroundColor: colors.surface.DEFAULT,
  },
  conditionOptionSelected: {
    borderColor: colors.primary[600]!,
    backgroundColor: colors.primary[50]!,
  },
  conditionContent: { flex: 1 },
  tradeSection: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[4],
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: radius.xl,
    marginTop: spacing[4],
    marginBottom: spacing[6],
  },
  tradeContent: { flex: 1 },
});

import { View, ScrollView, Image, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { Text, TextInput, Button, SegmentedButtons, Switch, useTheme, Snackbar, IconButton, Card, Chip, ProgressBar, Banner, Portal, Dialog } from 'react-native-paper';
import { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';
import { TarodanColors } from '../../src/theme';
import { canPerformAction, getUpgradeMessage, getRemainingCount } from '../../src/utils/membershipLimits';

const listingSchema = z.object({
  title: z.string().min(5, 'Başlık en az 5 karakter olmalı').max(200, 'Başlık en fazla 200 karakter olabilir'),
  description: z.string().max(5000, 'Açıklama en fazla 5000 karakter olabilir').optional(),
  price: z.string().refine(val => !isNaN(Number(val)) && Number(val) >= 1, 'Fiyat en az 1 TL olmalı'),
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
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { isAuthenticated, user, limits, canCreateListing, getRemainingListings, refreshUserData } = useAuthStore();
  const [images, setImages] = useState<string[]>([]);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<'listingLimit' | 'tradeFeature' | 'imageLimit'>('listingLimit');
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  // Get image limit based on membership
  const maxImages = limits?.maxImagesPerListing || 5;
  const remainingListings = getRemainingListings();
  const canCreate = canCreateListing();

  // Fetch categories from API
  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      try {
        const response = await api.get('/categories');
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

  // Check if trade feature is available
  const canTrade = limits?.canTrade || false;
  const watchTradeEnabled = watch('isTradeEnabled');

  // Effect to check listing limits on mount
  useEffect(() => {
    if (isAuthenticated) {
      refreshUserData();
    }
  }, [isAuthenticated]);

  const createMutation = useMutation({
    mutationFn: async (data: ListingForm) => {
      // Prepare payload matching API DTO
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

      return api.post('/products', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['my-listings'] });
      refreshUserData(); // Refresh user data to update listing count
      setSnackbar({ visible: true, message: 'İlan başarıyla oluşturuldu! Onay bekliyor.' });
      reset();
      setImages([]);
      setSelectedCategory('');
      setTimeout(() => router.push('/settings/my-listings'), 1500);
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'İlan oluşturulamadı';
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
      const newImages = result.assets.map(asset => asset.uri);
      setImages([...images, ...newImages].slice(0, maxImages));
    }
  };

  const takePhoto = async () => {
    if (images.length >= maxImages) return;

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
    });

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
    // Check listing limit before submitting
    if (!canCreate) {
      setUpgradeReason('listingLimit');
      setShowUpgradeDialog(true);
      return;
    }

    if (images.length === 0) {
      setSnackbar({ visible: true, message: 'En az bir fotoğraf ekleyin' });
      return;
    }

    // Check price limit for unverified members
    const price = parseFloat(data.price);
    const maxValue = limits?.maxValuePerListing || 5000;
    if (maxValue > 0 && price > maxValue && !user?.isVerified) {
      Alert.alert(
        'Fiyat Limiti',
        `Doğrulanmamış üyeler en fazla ${maxValue.toLocaleString('tr-TR')} TL değerinde ilan verebilir. Profil doğrulamanızı tamamlayın.`,
        [{ text: 'Tamam' }]
      );
      return;
    }

    createMutation.mutate(data);
  };

  // Not authenticated - show login prompt
  if (!isAuthenticated) {
    return (
      <View style={styles.centeredContainer}>
        <Ionicons name="add-circle-outline" size={64} color={TarodanColors.primary} />
        <Text variant="titleLarge" style={styles.loginTitle}>Giriş Yapın</Text>
        <Text variant="bodyMedium" style={styles.loginSubtitle}>
          İlan vermek için giriş yapmanız gerekiyor
        </Text>
        <Button mode="contained" onPress={() => router.push('/(auth)/login')} style={styles.loginButton}>
          Giriş Yap
        </Button>
        <Button mode="text" onPress={() => router.push('/(auth)/register')}>
          Hesabınız yok mu? Kayıt olun
        </Button>
      </View>
    );
  }

  // Listing limit reached
  if (!canCreate) {
    return (
      <View style={styles.centeredContainer}>
        <Ionicons name="alert-circle-outline" size={64} color={TarodanColors.warning} />
        <Text variant="titleLarge" style={styles.loginTitle}>İlan Limitine Ulaştınız</Text>
        <Text variant="bodyMedium" style={styles.loginSubtitle}>
          Ücretsiz üye olarak en fazla {limits?.maxListings || 10} ilan verebilirsiniz.
          Sınırsız ilan için Premium üyeliğe geçin.
        </Text>
        <Card style={styles.upgradeCard}>
          <Card.Content>
            <Text variant="titleMedium" style={{ color: TarodanColors.primary, marginBottom: 8 }}>
              Premium Avantajları
            </Text>
            <View style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={20} color={TarodanColors.success} />
              <Text style={styles.benefitText}>Sınırsız ilan verme</Text>
            </View>
            <View style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={20} color={TarodanColors.success} />
              <Text style={styles.benefitText}>15 fotoğraf yükleme</Text>
            </View>
            <View style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={20} color={TarodanColors.success} />
              <Text style={styles.benefitText}>Takas özelliği</Text>
            </View>
            <View style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={20} color={TarodanColors.success} />
              <Text style={styles.benefitText}>Dijital Garaj</Text>
            </View>
          </Card.Content>
        </Card>
        <Button mode="contained" onPress={() => router.push('/upgrade')} style={styles.upgradeButton}>
          Premium'a Geç - 99 TL/ay
        </Button>
        <Button mode="text" onPress={() => router.push('/settings/my-listings')}>
          Mevcut ilanlarımı görüntüle
        </Button>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.content}>
        {/* Listing Count Banner */}
        {remainingListings !== -1 && remainingListings <= 3 && (
          <Banner
            visible={true}
            icon="information"
            style={styles.warningBanner}
          >
            <Text>
              {remainingListings === 0 
                ? 'İlan limitinize ulaştınız!' 
                : `Kalan ilan hakkınız: ${remainingListings}/${limits?.maxListings || 10}`}
            </Text>
          </Banner>
        )}

        {/* Progress Indicator */}
        <Card style={styles.progressCard}>
          <Card.Content>
            <View style={styles.progressHeader}>
              <Text variant="titleSmall">İlan Kullanımı</Text>
              <Text variant="bodySmall" style={{ color: TarodanColors.textSecondary }}>
                {user?.listingCount || 0}/{limits?.maxListings === -1 ? '∞' : limits?.maxListings || 10}
              </Text>
            </View>
            {limits?.maxListings !== -1 && (
              <ProgressBar
                progress={(user?.listingCount || 0) / (limits?.maxListings || 10)}
                color={remainingListings <= 2 ? TarodanColors.warning : TarodanColors.primary}
                style={styles.progressBar}
              />
            )}
          </Card.Content>
        </Card>

        {/* Images Section */}
        <Text variant="titleMedium" style={styles.sectionTitle}>Fotoğraflar *</Text>
        <Text variant="bodySmall" style={styles.sectionSubtitle}>
          İlk fotoğraf kapak fotoğrafı olacak. Ücretsiz üyeler {maxImages} fotoğraf yükleyebilir.
        </Text>
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
                size={24}
                iconColor="#fff"
                style={styles.removeImageButton}
                onPress={() => removeImage(index)}
              />
            </View>
          ))}
          {images.length < maxImages && (
            <View style={styles.addImageButtons}>
              <TouchableOpacity style={styles.addImageButton} onPress={pickImage}>
                <Ionicons name="images-outline" size={32} color={TarodanColors.primary} />
                <Text variant="bodySmall">Galeri</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addImageButton} onPress={takePhoto}>
                <Ionicons name="camera-outline" size={32} color={TarodanColors.primary} />
                <Text variant="bodySmall">Kamera</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
        <Text variant="bodySmall" style={styles.imageCounter}>
          {images.length}/{maxImages} fotoğraf
        </Text>

        {/* Title */}
        <Controller
          control={control}
          name="title"
          render={({ field: { onChange, value } }) => (
            <TextInput
              label="Başlık *"
              value={value}
              onChangeText={onChange}
              error={!!errors.title}
              style={styles.input}
              placeholder="Örn: Hot Wheels 1967 Ford Mustang"
              maxLength={200}
            />
          )}
        />
        {errors.title && <Text style={styles.errorText}>{errors.title.message}</Text>}

        {/* Description */}
        <Controller
          control={control}
          name="description"
          render={({ field: { onChange, value } }) => (
            <TextInput
              label="Açıklama"
              value={value}
              onChangeText={onChange}
              multiline
              numberOfLines={4}
              style={styles.input}
              placeholder="Ürün hakkında detaylı bilgi verin..."
              maxLength={5000}
            />
          )}
        />

        {/* Price */}
        <Controller
          control={control}
          name="price"
          render={({ field: { onChange, value } }) => (
            <TextInput
              label="Fiyat (₺) *"
              value={value}
              onChangeText={onChange}
              keyboardType="numeric"
              error={!!errors.price}
              style={styles.input}
              left={<TextInput.Affix text="₺" />}
            />
          )}
        />
        {errors.price && <Text style={styles.errorText}>{errors.price.message}</Text>}
        {!user?.isVerified && (
          <Text variant="bodySmall" style={styles.limitWarning}>
            Doğrulanmamış üyeler en fazla {(limits?.maxValuePerListing || 5000).toLocaleString('tr-TR')} TL değerinde ilan verebilir
          </Text>
        )}

        {/* Category */}
        <Text variant="titleSmall" style={styles.fieldLabel}>Kategori *</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScrollView}>
          {categories.map((cat) => (
            <Chip
              key={cat.id}
              selected={selectedCategory === cat.id}
              onPress={() => {
                setSelectedCategory(cat.id);
                setValue('categoryId', cat.id);
              }}
              style={styles.chip}
              mode={selectedCategory === cat.id ? 'flat' : 'outlined'}
            >
              {cat.name}
            </Chip>
          ))}
        </ScrollView>
        {errors.categoryId && <Text style={styles.errorText}>{errors.categoryId.message}</Text>}

        {/* Brand */}
        <Text variant="titleSmall" style={styles.fieldLabel}>Marka *</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScrollView}>
          {BRANDS.map((brand) => (
            <Chip
              key={brand.id}
              selected={watch('brand') === brand.id}
              onPress={() => setValue('brand', brand.id)}
              style={styles.chip}
              mode={watch('brand') === brand.id ? 'flat' : 'outlined'}
            >
              {brand.name}
            </Chip>
          ))}
        </ScrollView>
        {errors.brand && <Text style={styles.errorText}>{errors.brand.message}</Text>}

        {/* Scale */}
        <Text variant="titleSmall" style={styles.fieldLabel}>Ölçek *</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScrollView}>
          {SCALES.map((scale) => (
            <Chip
              key={scale.id}
              selected={watch('scale') === scale.id}
              onPress={() => setValue('scale', scale.id)}
              style={styles.chip}
              mode={watch('scale') === scale.id ? 'flat' : 'outlined'}
            >
              {scale.name}
            </Chip>
          ))}
        </ScrollView>
        {errors.scale && <Text style={styles.errorText}>{errors.scale.message}</Text>}

        {/* Condition */}
        <Text variant="titleSmall" style={styles.fieldLabel}>Durum *</Text>
        {CONDITIONS.map((condition) => (
          <TouchableOpacity
            key={condition.id}
            style={[
              styles.conditionOption,
              watch('condition') === condition.id && styles.conditionOptionSelected,
            ]}
            onPress={() => setValue('condition', condition.id)}
          >
            <View style={styles.conditionContent}>
              <Text variant="bodyMedium" style={watch('condition') === condition.id ? styles.conditionTextSelected : undefined}>
                {condition.name}
              </Text>
              <Text variant="bodySmall" style={styles.conditionDescription}>
                {condition.description}
              </Text>
            </View>
            {watch('condition') === condition.id && (
              <Ionicons name="checkmark-circle" size={24} color={TarodanColors.primary} />
            )}
          </TouchableOpacity>
        ))}
        {errors.condition && <Text style={styles.errorText}>{errors.condition.message}</Text>}

        {/* Trade Available */}
        <View style={styles.tradeSection}>
          <View style={styles.tradeContent}>
            <Text variant="titleSmall">Takas Kabul</Text>
            <Text variant="bodySmall" style={styles.tradeSubtitle}>
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
            <TouchableOpacity onPress={() => {
              setUpgradeReason('tradeFeature');
              setShowUpgradeDialog(true);
            }}>
              <Ionicons name="lock-closed" size={20} color={TarodanColors.warning} style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          )}
        </View>

        {/* Submit Button */}
        <Button
          mode="contained"
          onPress={handleSubmit(onSubmit)}
          loading={createMutation.isPending}
          disabled={createMutation.isPending}
          style={styles.submitButton}
          contentStyle={styles.submitButtonContent}
        >
          İlanı Yayınla
        </Button>
        <Text variant="bodySmall" style={styles.submitNote}>
          İlanınız yayınlanmadan önce moderatör onayına tabi tutulacaktır.
        </Text>

        {/* Bottom Spacing */}
        <View style={{ height: 100 }} />
      </View>

      {/* Upgrade Dialog */}
      <Portal>
        <Dialog visible={showUpgradeDialog} onDismiss={() => setShowUpgradeDialog(false)}>
          <Dialog.Title>{getUpgradeMessage(upgradeReason).title}</Dialog.Title>
          <Dialog.Content>
            <Text>{getUpgradeMessage(upgradeReason).message}</Text>
            <View style={styles.dialogBenefits}>
              <Text variant="titleSmall" style={{ marginTop: 16, marginBottom: 8 }}>Premium Avantajları:</Text>
              <Text>• Sınırsız ilan</Text>
              <Text>• 15 fotoğraf yükleme</Text>
              <Text>• Takas özelliği</Text>
              <Text>• Dijital Garaj</Text>
              <Text>• Reklamsız deneyim</Text>
            </View>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowUpgradeDialog(false)}>Vazgeç</Button>
            <Button mode="contained" onPress={() => {
              setShowUpgradeDialog(false);
              router.push('/upgrade');
            }}>
              Premium'a Geç
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Snackbar */}
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
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#fff',
  },
  loginTitle: {
    marginTop: 16,
    marginBottom: 8,
  },
  loginSubtitle: {
    textAlign: 'center',
    marginBottom: 24,
    color: TarodanColors.textSecondary,
    paddingHorizontal: 16,
  },
  loginButton: {
    marginBottom: 8,
    width: '100%',
  },
  upgradeCard: {
    marginVertical: 16,
    width: '100%',
  },
  upgradeButton: {
    marginBottom: 8,
    width: '100%',
    backgroundColor: TarodanColors.primary,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  benefitText: {
    marginLeft: 8,
  },
  warningBanner: {
    marginBottom: 16,
    backgroundColor: TarodanColors.warningLight,
  },
  progressCard: {
    marginBottom: 16,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
  },
  sectionTitle: {
    marginBottom: 4,
  },
  sectionSubtitle: {
    color: TarodanColors.textSecondary,
    marginBottom: 12,
  },
  imageScrollView: {
    marginBottom: 8,
  },
  imageContainer: {
    marginRight: 12,
    position: 'relative',
  },
  image: {
    width: 120,
    height: 120,
    borderRadius: 8,
  },
  coverBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: TarodanColors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  coverBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  removeImageButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  addImageButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  addImageButton: {
    width: 100,
    height: 100,
    borderWidth: 2,
    borderColor: TarodanColors.outline,
    borderStyle: 'dashed',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageCounter: {
    color: TarodanColors.textSecondary,
    marginBottom: 16,
  },
  input: {
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  errorText: {
    color: TarodanColors.error,
    fontSize: 12,
    marginBottom: 8,
  },
  limitWarning: {
    color: TarodanColors.warning,
    marginBottom: 16,
  },
  fieldLabel: {
    marginTop: 16,
    marginBottom: 8,
  },
  chipScrollView: {
    marginBottom: 8,
  },
  chip: {
    marginRight: 8,
    marginBottom: 8,
  },
  conditionOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: TarodanColors.outline,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  conditionOptionSelected: {
    borderColor: TarodanColors.primary,
    backgroundColor: TarodanColors.primaryLight + '20',
  },
  conditionContent: {
    flex: 1,
  },
  conditionTextSelected: {
    color: TarodanColors.primary,
    fontWeight: '600',
  },
  conditionDescription: {
    color: TarodanColors.textSecondary,
    marginTop: 2,
  },
  tradeSection: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginTop: 16,
    marginBottom: 24,
  },
  tradeContent: {
    flex: 1,
  },
  tradeSubtitle: {
    color: TarodanColors.textSecondary,
  },
  submitButton: {
    marginTop: 8,
  },
  submitButtonContent: {
    paddingVertical: 8,
  },
  submitNote: {
    textAlign: 'center',
    color: TarodanColors.textSecondary,
    marginTop: 8,
  },
  dialogBenefits: {
    marginTop: 8,
  },
});

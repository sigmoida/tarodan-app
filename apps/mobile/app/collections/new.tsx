import { View, ScrollView, StyleSheet, TouchableOpacity, Image, Alert } from 'react-native';
import { Text, TextInput, Button, Switch, Card, SegmentedButtons, Snackbar, IconButton } from 'react-native-paper';
import { useState } from 'react';
import { router } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';
import { TarodanColors } from '../../src/theme';
import { canPerformAction, getUpgradeMessage } from '../../src/utils/membershipLimits';

const collectionSchema = z.object({
  name: z.string().min(3, 'Koleksiyon adı en az 3 karakter olmalı').max(100),
  description: z.string().max(500, 'Açıklama en fazla 500 karakter olabilir').optional(),
  isPublic: z.boolean(),
});

type CollectionForm = z.infer<typeof collectionSchema>;

const COLLECTION_TEMPLATES = [
  { id: 'ferrari', name: 'Ferrari Koleksiyonu', icon: '🏎️' },
  { id: 'vintage', name: 'Vintage Arabalar', icon: '🚗' },
  { id: 'trucks', name: 'Kamyonlar', icon: '🚚' },
  { id: 'f1', name: 'Formula 1', icon: '🏁' },
  { id: 'muscle', name: 'Muscle Cars', icon: '💪' },
  { id: 'custom', name: 'Özel Koleksiyon', icon: '⭐' },
];

export default function NewCollectionScreen() {
  const { isAuthenticated, limits } = useAuthStore();
  const queryClient = useQueryClient();
  
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });

  const canCreateCollections = limits?.canCreateCollections || false;

  const { control, handleSubmit, formState: { errors }, setValue, watch } = useForm<CollectionForm>({
    resolver: zodResolver(collectionSchema),
    defaultValues: {
      name: '',
      description: '',
      isPublic: true,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: CollectionForm) => {
      const formData = new FormData();
      formData.append('name', data.name);
      if (data.description) formData.append('description', data.description);
      formData.append('isPublic', String(data.isPublic));
      
      if (coverImage) {
        formData.append('coverImage', {
          uri: coverImage,
          type: 'image/jpeg',
          name: 'cover.jpg',
        } as any);
      }

      return api.post('/collections', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
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

  const selectTemplate = (template: typeof COLLECTION_TEMPLATES[0]) => {
    setSelectedTemplate(template.id);
    if (template.id !== 'custom') {
      setValue('name', template.name);
    }
  };

  const onSubmit = (data: CollectionForm) => {
    createMutation.mutate(data);
  };

  // Check premium access
  if (!canCreateCollections) {
    const upgradeInfo = getUpgradeMessage('collectionFeature');
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Dijital Garaj</Text>
          <View style={{ width: 24 }} />
        </View>
        
        <View style={styles.premiumRequired}>
          <MaterialCommunityIcons name="garage" size={80} color={TarodanColors.primary} />
          <Text variant="headlineSmall" style={styles.premiumTitle}>{upgradeInfo.title}</Text>
          <Text variant="bodyMedium" style={styles.premiumSubtitle}>{upgradeInfo.message}</Text>
          
          <View style={styles.premiumFeatures}>
            <View style={styles.premiumFeature}>
              <Ionicons name="checkmark-circle" size={20} color={TarodanColors.success} />
              <Text style={styles.premiumFeatureText}>Sınırsız koleksiyon oluşturun</Text>
            </View>
            <View style={styles.premiumFeature}>
              <Ionicons name="checkmark-circle" size={20} color={TarodanColors.success} />
              <Text style={styles.premiumFeatureText}>Koleksiyonlarınızı paylaşın</Text>
            </View>
            <View style={styles.premiumFeature}>
              <Ionicons name="checkmark-circle" size={20} color={TarodanColors.success} />
              <Text style={styles.premiumFeatureText}>QR kod ve sosyal medya paylaşımı</Text>
            </View>
            <View style={styles.premiumFeature}>
              <Ionicons name="checkmark-circle" size={20} color={TarodanColors.success} />
              <Text style={styles.premiumFeatureText}>Koleksiyoncu Vitrini'nde yer alın</Text>
            </View>
          </View>
          
          <Button mode="contained" onPress={() => router.push('/upgrade')} style={styles.upgradeButton}>
            Premium'a Yükselt
          </Button>
          <Button mode="text" onPress={() => router.back()}>
            Geri Dön
          </Button>
        </View>
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={styles.centeredContainer}>
        <Text variant="titleLarge">Giriş Yapın</Text>
        <Text variant="bodyMedium" style={styles.subtitle}>
          Koleksiyon oluşturmak için giriş yapmalısınız
        </Text>
        <Button mode="contained" onPress={() => router.push('/(auth)/login')}>
          Giriş Yap
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Yeni Koleksiyon</Text>
        <View style={{ width: 24 }} />
      </View>

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
            <IconButton
              icon="close-circle"
              size={24}
              style={styles.removeCoverButton}
              iconColor="#fff"
              onPress={() => setCoverImage(null)}
            />
          )}
        </TouchableOpacity>

        {/* Templates */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>Şablon Seçin</Text>
            <View style={styles.templatesGrid}>
              {COLLECTION_TEMPLATES.map((template) => (
                <TouchableOpacity
                  key={template.id}
                  style={[
                    styles.templateItem,
                    selectedTemplate === template.id && styles.templateItemSelected,
                  ]}
                  onPress={() => selectTemplate(template)}
                >
                  <Text style={styles.templateIcon}>{template.icon}</Text>
                  <Text variant="bodySmall" style={styles.templateName} numberOfLines={1}>
                    {template.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Card.Content>
        </Card>

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
                  placeholder="örn: Ferrari 1:18 Koleksiyonum"
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
                  placeholder="Koleksiyonunuz hakkında birkaç cümle..."
                />
              )}
            />
            {errors.description && (
              <Text variant="bodySmall" style={styles.errorText}>{errors.description.message}</Text>
            )}
          </Card.Content>
        </Card>

        {/* Privacy Settings */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>Gizlilik</Text>
            
            <View style={styles.privacyOption}>
              <View style={styles.privacyInfo}>
                <Ionicons name="globe-outline" size={24} color={TarodanColors.primary} />
                <View style={styles.privacyText}>
                  <Text variant="bodyMedium">Herkese Açık</Text>
                  <Text variant="bodySmall" style={styles.privacyDesc}>
                    Herkes koleksiyonunuzu görebilir
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
            
            {!watch('isPublic') && (
              <View style={styles.privateNote}>
                <Ionicons name="lock-closed" size={16} color={TarodanColors.textSecondary} />
                <Text variant="bodySmall" style={styles.privateNoteText}>
                  Özel koleksiyonlar sadece siz görebilirsiniz
                </Text>
              </View>
            )}
          </Card.Content>
        </Card>

        {/* Tips */}
        <Card style={styles.tipCard}>
          <Card.Content style={styles.tipContent}>
            <Ionicons name="bulb" size={24} color={TarodanColors.warning} />
            <View style={styles.tipText}>
              <Text variant="titleSmall">İpucu</Text>
              <Text variant="bodySmall" style={styles.tipDesc}>
                Koleksiyonunuzu oluşturduktan sonra ürünlerinizi ekleyebilir, düzenleyebilir ve paylaşabilirsiniz.
              </Text>
            </View>
          </Card.Content>
        </Card>

        {/* Submit Button */}
        <Button
          mode="contained"
          onPress={handleSubmit(onSubmit)}
          loading={createMutation.isPending}
          disabled={createMutation.isPending}
          style={styles.submitButton}
          icon="check"
        >
          Koleksiyon Oluştur
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
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  header: {
    backgroundColor: TarodanColors.primary,
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
    color: TarodanColors.textOnPrimary,
  },
  subtitle: {
    textAlign: 'center',
    marginVertical: 16,
    color: TarodanColors.textSecondary,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  coverImageContainer: {
    width: '100%',
    height: 180,
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
  removeCoverButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  card: {
    marginBottom: 16,
    backgroundColor: TarodanColors.background,
  },
  sectionTitle: {
    marginBottom: 16,
    color: TarodanColors.textPrimary,
  },
  templatesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  templateItem: {
    width: '30%',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: TarodanColors.border,
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  templateItemSelected: {
    borderColor: TarodanColors.primary,
    backgroundColor: TarodanColors.primary + '10',
  },
  templateIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  templateName: {
    textAlign: 'center',
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
  privateNote: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: TarodanColors.border,
  },
  privateNoteText: {
    marginLeft: 8,
    color: TarodanColors.textSecondary,
  },
  tipCard: {
    marginBottom: 16,
    backgroundColor: TarodanColors.warning + '15',
    borderWidth: 1,
    borderColor: TarodanColors.warning + '40',
  },
  tipContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tipText: {
    flex: 1,
    marginLeft: 12,
  },
  tipDesc: {
    color: TarodanColors.textSecondary,
    marginTop: 2,
  },
  submitButton: {
    marginBottom: 16,
    backgroundColor: TarodanColors.primary,
    borderRadius: 8,
    paddingVertical: 4,
  },
  premiumRequired: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: TarodanColors.background,
  },
  premiumTitle: {
    marginTop: 24,
    textAlign: 'center',
    color: TarodanColors.textPrimary,
  },
  premiumSubtitle: {
    marginTop: 8,
    textAlign: 'center',
    color: TarodanColors.textSecondary,
  },
  premiumFeatures: {
    marginTop: 24,
    alignSelf: 'flex-start',
    width: '100%',
  },
  premiumFeature: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
  },
  premiumFeatureText: {
    marginLeft: 12,
    color: TarodanColors.textPrimary,
  },
  upgradeButton: {
    marginTop: 24,
    backgroundColor: TarodanColors.primary,
    width: '100%',
  },
});

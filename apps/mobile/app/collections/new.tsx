import { View, ScrollView, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { theme, Button, Switch, Snackbar, IconButton, Text, Input, Textarea } from '@tarodan/ui-native';
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
import { getUpgradeMessage } from '../../src/utils/membershipLimits';

const { colors } = theme;

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
            <Ionicons name="arrow-back" size={24} color={colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Dijital Garaj</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.premiumRequired}>
          <MaterialCommunityIcons name="garage" size={80} color={colors.primary[600]!} />
          <Text variant="h2" style={styles.premiumTitle}>{upgradeInfo.title}</Text>
          <Text variant="body" style={styles.premiumSubtitle}>{upgradeInfo.message}</Text>

          <View style={styles.premiumFeatures}>
            <View style={styles.premiumFeature}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success[600]!} />
              <Text style={styles.premiumFeatureText}>Sınırsız koleksiyon oluşturun</Text>
            </View>
            <View style={styles.premiumFeature}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success[600]!} />
              <Text style={styles.premiumFeatureText}>Koleksiyonlarınızı paylaşın</Text>
            </View>
            <View style={styles.premiumFeature}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success[600]!} />
              <Text style={styles.premiumFeatureText}>QR kod ve sosyal medya paylaşımı</Text>
            </View>
            <View style={styles.premiumFeature}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success[600]!} />
              <Text style={styles.premiumFeatureText}>Koleksiyoncu Vitrini'nde yer alın</Text>
            </View>
          </View>

          <Button variant="primary" title="Premium'a Yükselt" onPress={() => router.push('/upgrade')} style={styles.upgradeButton} />
          <Button variant="ghost" title="Geri Dön" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={styles.centeredContainer}>
        <Text variant="h2">Giriş Yapın</Text>
        <Text variant="body" style={styles.subtitle}>
          Koleksiyon oluşturmak için giriş yapmalısınız
        </Text>
        <Button variant="primary" title="Giriş Yap" onPress={() => router.push('/(auth)/login')} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.white} />
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
              <Ionicons name="image-outline" size={48} color={colors.text.muted} />
              <Text variant="body" style={styles.coverImageText}>
                Kapak fotoğrafı ekle
              </Text>
            </View>
          )}
          {coverImage && (
            <IconButton
              icon="close-circle"
              accessibilityLabel="Kapak fotoğrafını kaldır"
              size="md"
              style={styles.removeCoverButton}
              onPress={() => setCoverImage(null)}
            />
          )}
        </TouchableOpacity>

        {/* Templates */}
        <View style={styles.card}>
          <Text variant="h3" style={styles.sectionTitle}>Şablon Seçin</Text>
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
                <Text variant="bodySm" style={styles.templateName} numberOfLines={1}>
                  {template.name}
                </Text>
              </TouchableOpacity>
            ))}
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
                placeholder="örn: Ferrari 1:18 Koleksiyonum"
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
                error={errors.description?.message}
                placeholder="Koleksiyonunuz hakkında birkaç cümle..."
                containerStyle={styles.input}
              />
            )}
          />
        </View>

        {/* Privacy Settings */}
        <View style={styles.card}>
          <Text variant="h3" style={styles.sectionTitle}>Gizlilik</Text>

          <View style={styles.privacyOption}>
            <View style={styles.privacyInfo}>
              <Ionicons name="globe-outline" size={24} color={colors.primary[600]!} />
              <View style={styles.privacyText}>
                <Text variant="body">Herkese Açık</Text>
                <Text variant="bodySm" style={styles.privacyDesc}>
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
              <Ionicons name="lock-closed" size={16} color={colors.text.muted} />
              <Text variant="bodySm" style={styles.privateNoteText}>
                Özel koleksiyonlar sadece siz görebilirsiniz
              </Text>
            </View>
          )}
        </View>

        {/* Tips */}
        <View style={styles.tipCard}>
          <View style={styles.tipContent}>
            <Ionicons name="bulb" size={24} color={colors.warning[600]!} />
            <View style={styles.tipText}>
              <Text variant="label">İpucu</Text>
              <Text variant="bodySm" style={styles.tipDesc}>
                Koleksiyonunuzu oluşturduktan sonra ürünlerinizi ekleyebilir, düzenleyebilir ve paylaşabilirsiniz.
              </Text>
            </View>
          </View>
        </View>

        {/* Submit Button */}
        <Button
          variant="primary"
          title="Koleksiyon Oluştur"
          onPress={handleSubmit(onSubmit)}
          isLoading={createMutation.isPending}
          disabled={createMutation.isPending}
          icon="checkmark"
          style={styles.submitButton}
        />

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
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
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
  subtitle: {
    textAlign: 'center',
    marginVertical: 16,
    color: colors.text.muted,
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
  removeCoverButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: colors.overlay.black50,
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
    borderColor: colors.border.DEFAULT,
    backgroundColor: colors.surface.alt,
  },
  templateItemSelected: {
    borderColor: colors.primary[600]!,
    backgroundColor: colors.primary[50]!,
  },
  templateIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  templateName: {
    textAlign: 'center',
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
  privateNote: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border.DEFAULT,
  },
  privateNoteText: {
    marginLeft: 8,
    color: colors.text.muted,
  },
  tipCard: {
    marginBottom: 16,
    backgroundColor: colors.warning[50]!,
    borderWidth: 1,
    borderColor: colors.warning[200]!,
    padding: 16,
    borderRadius: 12,
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
    color: colors.text.muted,
    marginTop: 2,
  },
  submitButton: {
    marginBottom: 16,
  },
  premiumRequired: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: colors.surface.DEFAULT,
  },
  premiumTitle: {
    marginTop: 24,
    textAlign: 'center',
    color: colors.text.heading,
  },
  premiumSubtitle: {
    marginTop: 8,
    textAlign: 'center',
    color: colors.text.muted,
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
    color: colors.text.heading,
  },
  upgradeButton: {
    marginTop: 24,
    width: '100%',
  },
});

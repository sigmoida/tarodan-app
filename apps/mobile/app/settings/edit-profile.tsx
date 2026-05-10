import { View, ScrollView, StyleSheet, TouchableOpacity, Image, Alert } from 'react-native';
import {
  Button,
  Card,
  Switch,
  Divider,
  Snackbar,
  Avatar,
  Input,
  Text,
  theme,
} from '@tarodan/ui-native';
import { useState, useEffect } from 'react';
import { router } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';
import { MembershipBadgeCard } from '../../src/components/PremiumBadge';
import { useTranslation } from '../../src/i18n';

const { colors, radius } = theme;

// Free: 500 chars, Premium: 2000 chars
const getMaxBioLength = (isPremium: boolean) => isPremium ? 2000 : 500;

const createProfileSchema = (isPremium: boolean) => z.object({
  displayName: z.string().min(2, 'İsim en az 2 karakter olmalı').max(50),
  bio: z.string().max(getMaxBioLength(isPremium), `Biyografi en fazla ${getMaxBioLength(isPremium)} karakter olabilir`).optional(),
  // Premium features
  websiteUrl: z.string().url('Geçerli bir URL girin').optional().or(z.literal('')),
  twitterHandle: z.string().max(50).optional(),
  instagramHandle: z.string().max(50).optional(),
  facebookUrl: z.string().url('Geçerli bir URL girin').optional().or(z.literal('')),
  youtubeUrl: z.string().url('Geçerli bir URL girin').optional().or(z.literal('')),
  customProfileSlug: z.string().min(3).max(30).regex(/^[a-z0-9-]+$/, 'Sadece küçük harf, rakam ve tire kullanın').optional(),
  // Preferences
  showEmail: z.boolean(),
  showPhone: z.boolean(),
  allowMessages: z.boolean(),
});

type ProfileForm = z.infer<ReturnType<typeof createProfileSchema>>;

export default function EditProfileScreen() {
  const { t } = useTranslation();
  const { user, isAuthenticated, limits, updateUser } = useAuthStore();
  const queryClient = useQueryClient();

  const [avatar, setAvatar] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string; variant?: 'default' | 'success' | 'danger' }>({
    visible: false,
    message: '',
  });

  const isPremium = limits?.maxListings === -1;
  const maxBioLength = getMaxBioLength(isPremium);

  const { control, handleSubmit, formState: { errors }, watch } = useForm<ProfileForm>({
    resolver: zodResolver(createProfileSchema(isPremium)),
    defaultValues: {
      displayName: user?.displayName || '',
      bio: user?.bio || '',
      websiteUrl: user?.websiteUrl || '',
      twitterHandle: user?.twitterHandle || '',
      instagramHandle: user?.instagramHandle || '',
      facebookUrl: user?.facebookUrl || '',
      youtubeUrl: user?.youtubeUrl || '',
      customProfileSlug: user?.customProfileSlug || '',
      showEmail: user?.showEmail ?? false,
      showPhone: user?.showPhone ?? false,
      allowMessages: user?.allowMessages ?? true,
    },
  });

  useEffect(() => {
    if (user?.avatar) {
      setAvatar(user.avatar);
    }
  }, [user]);

  const updateMutation = useMutation({
    mutationFn: async (data: ProfileForm) => {
      const formData = new FormData();

      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          formData.append(key, typeof value === 'boolean' ? String(value) : value);
        }
      });

      if (avatar && avatar !== user?.avatar && !avatar.startsWith('http')) {
        formData.append('avatar', {
          uri: avatar,
          type: 'image/jpeg',
          name: 'avatar.jpg',
        } as any);
      }

      return api.patch('/users/me', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: (response) => {
      updateUser(response.data);
      queryClient.invalidateQueries({ queryKey: ['user'] });
      setSnackbar({ visible: true, message: 'Profil güncellendi!', variant: 'success' });
    },
    onError: (error: any) => {
      setSnackbar({
        visible: true,
        message: error.response?.data?.message || 'Güncelleme başarısız',
        variant: 'danger',
      });
    },
  });

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      setAvatar(result.assets[0].uri);
    }
  };

  const onSubmit = (data: ProfileForm) => {
    updateMutation.mutate(data);
  };

  const bioLength = watch('bio')?.length || 0;

  if (!isAuthenticated) {
    return (
      <View style={styles.centeredContainer}>
        <Text variant="h3">Giriş Yapın</Text>
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
        <Text style={styles.headerTitle}>{t('mobile.settingsEditProfile')}</Text>
        <TouchableOpacity onPress={handleSubmit(onSubmit)}>
          <Text style={styles.saveButton}>{t('mobile.save')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Avatar Section */}
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={pickAvatar}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatar} />
            ) : (
              <Avatar
                size="xl"
                name={user?.displayName || 'U'}
              />
            )}
            <View style={styles.avatarEditBadge}>
              <Ionicons name="camera" size={18} color={colors.white} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Membership Badge */}
        <View style={styles.membershipSection}>
          <MembershipBadgeCard
            membershipTier={user?.membershipTier || 'free'}
            isVerified={user?.isVerified}
            onUpgrade={() => router.push('/upgrade')}
          />
        </View>

        {/* Basic Info */}
        <Card style={styles.card}>
          <Text variant="h3" style={styles.sectionTitle}>Temel Bilgiler</Text>

          <Controller
            control={control}
            name="displayName"
            render={({ field: { onChange, value } }) => (
              <Input
                label="Görünen İsim *"
                value={value}
                onChangeText={onChange}
                error={errors.displayName?.message}
                containerStyle={styles.input}
              />
            )}
          />

          <Controller
            control={control}
            name="bio"
            render={({ field: { onChange, value } }) => (
              <Input
                label={`Hakkımda (${bioLength}/${maxBioLength})`}
                value={value}
                onChangeText={onChange}
                multiline
                numberOfLines={4}
                containerStyle={styles.input}
                placeholder={t("mobile.bioPlaceholder")}
                error={errors.bio?.message}
              />
            )}
          />

          {!isPremium && (
            <TouchableOpacity
              style={styles.upgradeHint}
              onPress={() => router.push('/upgrade')}
            >
              <Ionicons name="diamond" size={16} color={colors.primary[600]!} />
              <Text variant="bodySm" style={styles.upgradeHintText}>
                Premium ile 2000 karaktere kadar biyografi yazabilirsiniz
              </Text>
            </TouchableOpacity>
          )}
        </Card>

        {/* Custom URL (Premium Only) */}
        {isPremium && (
          <Card style={styles.card}>
            <View style={styles.premiumFeatureHeader}>
              <MaterialCommunityIcons name="crown" size={20} color={colors.primary[600]!} />
              <Text variant="h3" style={styles.premiumFeatureTitle}>Özel Profil URL</Text>
            </View>

            <View style={styles.urlPreview}>
              <Text variant="bodySm" style={styles.urlPrefix}>tarodan.com/</Text>
              <Controller
                control={control}
                name="customProfileSlug"
                render={({ field: { onChange, value } }) => (
                  <Input
                    value={value}
                    onChangeText={onChange}
                    inputSize="sm"
                    containerStyle={styles.slugInput}
                    placeholder="kullanici-adi"
                    error={errors.customProfileSlug?.message}
                  />
                )}
              />
            </View>
            <Text variant="bodySm" style={styles.hintText}>
              Sadece küçük harfler, rakamlar ve tire (-) kullanabilirsiniz
            </Text>
          </Card>
        )}

        {/* Social Links (Premium Only) */}
        {isPremium ? (
          <Card style={styles.card}>
            <View style={styles.premiumFeatureHeader}>
              <MaterialCommunityIcons name="crown" size={20} color={colors.primary[600]!} />
              <Text variant="h3" style={styles.premiumFeatureTitle}>Sosyal Medya Bağlantıları</Text>
            </View>

            <Controller
              control={control}
              name="websiteUrl"
              render={({ field: { onChange, value } }) => (
                <Input
                  label="Web Sitesi"
                  value={value}
                  onChangeText={onChange}
                  containerStyle={styles.input}
                  placeholder="https://websitem.com"
                  leftIconName="globe-outline"
                  error={errors.websiteUrl?.message}
                />
              )}
            />

            <Controller
              control={control}
              name="instagramHandle"
              render={({ field: { onChange, value } }) => (
                <Input
                  label="Instagram"
                  value={value}
                  onChangeText={onChange}
                  containerStyle={styles.input}
                  placeholder="kullanici_adi"
                  leftIconName="logo-instagram"
                />
              )}
            />

            <Controller
              control={control}
              name="twitterHandle"
              render={({ field: { onChange, value } }) => (
                <Input
                  label="Twitter / X"
                  value={value}
                  onChangeText={onChange}
                  containerStyle={styles.input}
                  placeholder="kullanici_adi"
                  leftIconName="logo-twitter"
                />
              )}
            />

            <Controller
              control={control}
              name="youtubeUrl"
              render={({ field: { onChange, value } }) => (
                <Input
                  label="YouTube"
                  value={value}
                  onChangeText={onChange}
                  containerStyle={styles.input}
                  placeholder="https://youtube.com/@kanal"
                  leftIconName="logo-youtube"
                  error={errors.youtubeUrl?.message}
                />
              )}
            />
          </Card>
        ) : (
          <Card style={styles.lockedCard}>
            <View style={styles.lockedContent}>
              <Ionicons name="lock-closed" size={24} color={colors.text.muted} />
              <Text variant="body" style={styles.lockedTitle}>Sosyal Medya Bağlantıları</Text>
              <Text variant="bodySm" style={styles.lockedText}>
                Premium üyeler profillerine sosyal medya bağlantıları ekleyebilir
              </Text>
              <Button variant="outline" title="Premium'a Geç" onPress={() => router.push('/upgrade')} style={styles.lockedButton} />
            </View>
          </Card>
        )}

        {/* Privacy Settings */}
        <Card style={styles.card}>
          <Text variant="h3" style={styles.sectionTitle}>Gizlilik Ayarları</Text>

          <View style={styles.switchRow}>
            <View style={styles.switchInfo}>
              <Text variant="body">E-posta Göster</Text>
              <Text variant="bodySm" style={styles.switchHint}>
                E-postanız profilinizde görünsün mü?
              </Text>
            </View>
            <Controller
              control={control}
              name="showEmail"
              render={({ field: { onChange, value } }) => (
                <Switch value={value} onValueChange={onChange} />
              )}
            />
          </View>

          <Divider style={styles.switchDivider} />

          <View style={styles.switchRow}>
            <View style={styles.switchInfo}>
              <Text variant="body">Telefon Göster</Text>
              <Text variant="bodySm" style={styles.switchHint}>
                Telefonunuz profilinizde görünsün mü?
              </Text>
            </View>
            <Controller
              control={control}
              name="showPhone"
              render={({ field: { onChange, value } }) => (
                <Switch value={value} onValueChange={onChange} />
              )}
            />
          </View>

          <Divider style={styles.switchDivider} />

          <View style={styles.switchRow}>
            <View style={styles.switchInfo}>
              <Text variant="body">Mesaj Almaya İzin Ver</Text>
              <Text variant="bodySm" style={styles.switchHint}>
                Diğer üyeler size mesaj gönderebilsin mi?
              </Text>
            </View>
            <Controller
              control={control}
              name="allowMessages"
              render={({ field: { onChange, value } }) => (
                <Switch value={value} onValueChange={onChange} />
              )}
            />
          </View>
        </Card>

        {/* Verification Status */}
        <Card style={styles.card}>
          <Text variant="h3" style={styles.sectionTitle}>Doğrulama Durumu</Text>

          <View style={styles.verificationItem}>
            <Ionicons
              name={user?.isEmailVerified ? 'checkmark-circle' : 'ellipse-outline'}
              size={24}
              color={user?.isEmailVerified ? colors.success[600]! : colors.text.muted}
            />
            <Text variant="body" style={styles.verificationText}>
              E-posta Doğrulandı
            </Text>
            {!user?.isEmailVerified && (
              <Button variant="ghost" size="sm" title="Doğrula" onPress={() => {}} />
            )}
          </View>

          <View style={styles.verificationItem}>
            <Ionicons
              name={user?.isPhoneVerified ? 'checkmark-circle' : 'ellipse-outline'}
              size={24}
              color={user?.isPhoneVerified ? colors.success[600]! : colors.text.muted}
            />
            <Text variant="body" style={styles.verificationText}>
              Telefon Doğrulandı
            </Text>
            {!user?.isPhoneVerified && (
              <Button variant="ghost" size="sm" title="Doğrula" onPress={() => {}} />
            )}
          </View>

          {user?.isVerified && (
            <View style={styles.verifiedBanner}>
              <Ionicons name="shield-checkmark" size={24} color={colors.success[600]!} />
              <Text variant="body" style={styles.verifiedText}>
                {isPremium ? 'Doğrulanmış Premium Koleksiyoner' : 'Doğrulanmış Üye'}
              </Text>
            </View>
          )}
        </Card>

        {/* Submit Button */}
        <Button
          variant="primary"
          title="Değişiklikleri Kaydet"
          icon="checkmark"
          onPress={handleSubmit(onSubmit)}
          isLoading={updateMutation.isPending}
          disabled={updateMutation.isPending}
          style={styles.submitButton}
        />

        <View style={{ height: 50 }} />
      </ScrollView>

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ ...snackbar, visible: false })}
        duration={3000}
        variant={snackbar.variant ?? 'default'}
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
    gap: 16,
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
  saveButton: {
    color: colors.white,
    fontWeight: '600',
    fontSize: 16,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: colors.primary[600]!,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.surface.elevated,
  },
  membershipSection: {
    marginBottom: 16,
  },
  card: {
    marginBottom: 16,
    backgroundColor: colors.surface.DEFAULT,
  },
  sectionTitle: {
    marginBottom: 16,
    color: colors.text.heading,
  },
  input: {
    marginBottom: 12,
  },
  hintText: {
    color: colors.text.muted,
    marginTop: 4,
  },
  upgradeHint: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary[50]!,
    padding: 8,
    borderRadius: radius.md,
    marginTop: 8,
  },
  upgradeHintText: {
    marginLeft: 8,
    color: colors.primary[700]!,
    flex: 1,
  },
  premiumFeatureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  premiumFeatureTitle: {
    marginLeft: 8,
    color: colors.primary[700]!,
  },
  urlPreview: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  urlPrefix: {
    color: colors.text.muted,
    marginRight: 4,
  },
  slugInput: {
    flex: 1,
  },
  lockedCard: {
    marginBottom: 16,
    backgroundColor: colors.surface.alt,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
    borderStyle: 'dashed',
  },
  lockedContent: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  lockedTitle: {
    marginTop: 8,
    color: colors.text.heading,
    fontWeight: '600',
  },
  lockedText: {
    marginTop: 4,
    color: colors.text.muted,
    textAlign: 'center',
  },
  lockedButton: {
    marginTop: 12,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  switchInfo: {
    flex: 1,
  },
  switchHint: {
    color: colors.text.muted,
    marginTop: 2,
  },
  switchDivider: {
    marginVertical: 8,
  },
  verificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  verificationText: {
    flex: 1,
    marginLeft: 12,
    color: colors.text.heading,
  },
  verifiedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.success[50]!,
    padding: 12,
    borderRadius: radius.md,
    marginTop: 8,
  },
  verifiedText: {
    marginLeft: 8,
    color: colors.success[700]!,
    fontWeight: '500',
  },
  submitButton: {
    marginTop: 8,
  },
});

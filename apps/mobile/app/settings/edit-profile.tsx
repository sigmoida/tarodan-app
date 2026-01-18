import { View, ScrollView, StyleSheet, TouchableOpacity, Image, Alert, Linking } from 'react-native';
import { Text, TextInput, Button, Card, Switch, Divider, Snackbar, ActivityIndicator, Avatar, IconButton, List } from 'react-native-paper';
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
import { TarodanColors } from '../../src/theme';
import { PremiumBadge, MembershipBadgeCard } from '../../src/components/PremiumBadge';
import { ReputationScore } from '../../src/components/ReputationBadge';

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
  const { user, isAuthenticated, limits, updateUser } = useAuthStore();
  const queryClient = useQueryClient();
  
  const [avatar, setAvatar] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });

  const isPremium = limits?.maxListings === -1;
  const maxBioLength = getMaxBioLength(isPremium);

  const { control, handleSubmit, formState: { errors }, watch, setValue } = useForm<ProfileForm>({
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
      setSnackbar({ visible: true, message: 'Profil güncellendi!' });
    },
    onError: (error: any) => {
      setSnackbar({ visible: true, message: error.response?.data?.message || 'Güncelleme başarısız' });
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
        <Text variant="titleLarge">Giriş Yapın</Text>
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
        <Text style={styles.headerTitle}>Profili Düzenle</Text>
        <TouchableOpacity onPress={handleSubmit(onSubmit)}>
          <Text style={styles.saveButton}>Kaydet</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Avatar Section */}
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={pickAvatar}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatar} />
            ) : (
              <Avatar.Text
                size={100}
                label={user?.displayName?.substring(0, 2).toUpperCase() || 'U'}
                style={styles.avatarPlaceholder}
              />
            )}
            <View style={styles.avatarEditBadge}>
              <Ionicons name="camera" size={18} color="#fff" />
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
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>Temel Bilgiler</Text>
            
            <Controller
              control={control}
              name="displayName"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  label="Görünen İsim *"
                  value={value}
                  onChangeText={onChange}
                  error={!!errors.displayName}
                  mode="outlined"
                  style={styles.input}
                />
              )}
            />
            {errors.displayName && (
              <Text variant="bodySmall" style={styles.errorText}>{errors.displayName.message}</Text>
            )}

            <Controller
              control={control}
              name="bio"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  label={`Hakkımda (${bioLength}/${maxBioLength})`}
                  value={value}
                  onChangeText={onChange}
                  multiline
                  numberOfLines={4}
                  mode="outlined"
                  style={styles.input}
                  placeholder="Kendinizi kısaca tanıtın..."
                  error={!!errors.bio}
                />
              )}
            />
            {errors.bio && (
              <Text variant="bodySmall" style={styles.errorText}>{errors.bio.message}</Text>
            )}
            
            {!isPremium && (
              <TouchableOpacity 
                style={styles.upgradeHint}
                onPress={() => router.push('/upgrade')}
              >
                <Ionicons name="diamond" size={16} color={TarodanColors.primary} />
                <Text variant="bodySmall" style={styles.upgradeHintText}>
                  Premium ile 2000 karaktere kadar biyografi yazabilirsiniz
                </Text>
              </TouchableOpacity>
            )}
          </Card.Content>
        </Card>

        {/* Custom URL (Premium Only) */}
        {isPremium && (
          <Card style={styles.card}>
            <Card.Content>
              <View style={styles.premiumFeatureHeader}>
                <MaterialCommunityIcons name="crown" size={20} color={TarodanColors.primary} />
                <Text variant="titleMedium" style={styles.premiumFeatureTitle}>Özel Profil URL</Text>
              </View>
              
              <View style={styles.urlPreview}>
                <Text variant="bodySmall" style={styles.urlPrefix}>tarodan.com/</Text>
                <Controller
                  control={control}
                  name="customProfileSlug"
                  render={({ field: { onChange, value } }) => (
                    <TextInput
                      value={value}
                      onChangeText={onChange}
                      mode="outlined"
                      dense
                      style={styles.slugInput}
                      placeholder="kullanici-adi"
                      error={!!errors.customProfileSlug}
                    />
                  )}
                />
              </View>
              {errors.customProfileSlug && (
                <Text variant="bodySmall" style={styles.errorText}>{errors.customProfileSlug.message}</Text>
              )}
              <Text variant="bodySmall" style={styles.hintText}>
                Sadece küçük harfler, rakamlar ve tire (-) kullanabilirsiniz
              </Text>
            </Card.Content>
          </Card>
        )}

        {/* Social Links (Premium Only) */}
        {isPremium ? (
          <Card style={styles.card}>
            <Card.Content>
              <View style={styles.premiumFeatureHeader}>
                <MaterialCommunityIcons name="crown" size={20} color={TarodanColors.primary} />
                <Text variant="titleMedium" style={styles.premiumFeatureTitle}>Sosyal Medya Bağlantıları</Text>
              </View>
              
              <Controller
                control={control}
                name="websiteUrl"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    label="Web Sitesi"
                    value={value}
                    onChangeText={onChange}
                    mode="outlined"
                    style={styles.input}
                    placeholder="https://websitem.com"
                    left={<TextInput.Icon icon="web" />}
                    error={!!errors.websiteUrl}
                  />
                )}
              />
              
              <Controller
                control={control}
                name="instagramHandle"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    label="Instagram"
                    value={value}
                    onChangeText={onChange}
                    mode="outlined"
                    style={styles.input}
                    placeholder="kullanici_adi"
                    left={<TextInput.Icon icon="instagram" />}
                  />
                )}
              />
              
              <Controller
                control={control}
                name="twitterHandle"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    label="Twitter / X"
                    value={value}
                    onChangeText={onChange}
                    mode="outlined"
                    style={styles.input}
                    placeholder="kullanici_adi"
                    left={<TextInput.Icon icon="twitter" />}
                  />
                )}
              />
              
              <Controller
                control={control}
                name="youtubeUrl"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    label="YouTube"
                    value={value}
                    onChangeText={onChange}
                    mode="outlined"
                    style={styles.input}
                    placeholder="https://youtube.com/@kanal"
                    left={<TextInput.Icon icon="youtube" />}
                    error={!!errors.youtubeUrl}
                  />
                )}
              />
            </Card.Content>
          </Card>
        ) : (
          <Card style={styles.lockedCard}>
            <Card.Content style={styles.lockedContent}>
              <Ionicons name="lock-closed" size={24} color={TarodanColors.textSecondary} />
              <Text variant="titleSmall" style={styles.lockedTitle}>Sosyal Medya Bağlantıları</Text>
              <Text variant="bodySmall" style={styles.lockedText}>
                Premium üyeler profillerine sosyal medya bağlantıları ekleyebilir
              </Text>
              <Button mode="outlined" onPress={() => router.push('/upgrade')} style={styles.lockedButton}>
                Premium'a Geç
              </Button>
            </Card.Content>
          </Card>
        )}

        {/* Privacy Settings */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>Gizlilik Ayarları</Text>
            
            <View style={styles.switchRow}>
              <View style={styles.switchInfo}>
                <Text variant="bodyMedium">E-posta Göster</Text>
                <Text variant="bodySmall" style={styles.switchHint}>
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
                <Text variant="bodyMedium">Telefon Göster</Text>
                <Text variant="bodySmall" style={styles.switchHint}>
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
                <Text variant="bodyMedium">Mesaj Almaya İzin Ver</Text>
                <Text variant="bodySmall" style={styles.switchHint}>
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
          </Card.Content>
        </Card>

        {/* Verification Status */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>Doğrulama Durumu</Text>
            
            <View style={styles.verificationItem}>
              <Ionicons 
                name={user?.isEmailVerified ? 'checkmark-circle' : 'ellipse-outline'} 
                size={24} 
                color={user?.isEmailVerified ? TarodanColors.success : TarodanColors.textSecondary} 
              />
              <Text variant="bodyMedium" style={styles.verificationText}>
                E-posta Doğrulandı
              </Text>
              {!user?.isEmailVerified && (
                <Button compact mode="text" onPress={() => {}}>
                  Doğrula
                </Button>
              )}
            </View>
            
            <View style={styles.verificationItem}>
              <Ionicons 
                name={user?.isPhoneVerified ? 'checkmark-circle' : 'ellipse-outline'} 
                size={24} 
                color={user?.isPhoneVerified ? TarodanColors.success : TarodanColors.textSecondary} 
              />
              <Text variant="bodyMedium" style={styles.verificationText}>
                Telefon Doğrulandı
              </Text>
              {!user?.isPhoneVerified && (
                <Button compact mode="text" onPress={() => {}}>
                  Doğrula
                </Button>
              )}
            </View>
            
            {user?.isVerified && (
              <View style={styles.verifiedBanner}>
                <Ionicons name="shield-checkmark" size={24} color={TarodanColors.success} />
                <Text variant="bodyMedium" style={styles.verifiedText}>
                  {isPremium ? 'Doğrulanmış Premium Koleksiyoner' : 'Doğrulanmış Üye'}
                </Text>
              </View>
            )}
          </Card.Content>
        </Card>

        {/* Submit Button */}
        <Button
          mode="contained"
          onPress={handleSubmit(onSubmit)}
          loading={updateMutation.isPending}
          disabled={updateMutation.isPending}
          style={styles.submitButton}
          icon="check"
        >
          Değişiklikleri Kaydet
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
    gap: 16,
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
  saveButton: {
    color: TarodanColors.textOnPrimary,
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
  avatarPlaceholder: {
    backgroundColor: TarodanColors.primaryLight,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: TarodanColors.primary,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: TarodanColors.background,
  },
  membershipSection: {
    marginBottom: 16,
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
  hintText: {
    color: TarodanColors.textSecondary,
    marginTop: 4,
  },
  upgradeHint: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TarodanColors.primary + '10',
    padding: 8,
    borderRadius: 8,
    marginTop: 8,
  },
  upgradeHintText: {
    marginLeft: 8,
    color: TarodanColors.primary,
    flex: 1,
  },
  premiumFeatureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  premiumFeatureTitle: {
    marginLeft: 8,
    color: TarodanColors.primary,
  },
  urlPreview: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  urlPrefix: {
    color: TarodanColors.textSecondary,
    marginRight: 4,
  },
  slugInput: {
    flex: 1,
    backgroundColor: TarodanColors.background,
  },
  lockedCard: {
    marginBottom: 16,
    backgroundColor: TarodanColors.backgroundSecondary,
    borderWidth: 1,
    borderColor: TarodanColors.border,
    borderStyle: 'dashed',
  },
  lockedContent: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  lockedTitle: {
    marginTop: 8,
    color: TarodanColors.textPrimary,
  },
  lockedText: {
    marginTop: 4,
    color: TarodanColors.textSecondary,
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
    color: TarodanColors.textSecondary,
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
    color: TarodanColors.textPrimary,
  },
  verifiedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TarodanColors.success + '15',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  verifiedText: {
    marginLeft: 8,
    color: TarodanColors.success,
    fontWeight: '500',
  },
  submitButton: {
    marginTop: 8,
    backgroundColor: TarodanColors.primary,
    borderRadius: 8,
  },
});

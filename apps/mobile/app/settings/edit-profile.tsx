import { View, ScrollView, StyleSheet, TouchableOpacity, Image } from 'react-native';
import {
  Button,
  Card,
  Avatar,
  DateField,
  Input,
  Text,
  Snackbar,
  ScreenHeader,
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
import { userApi, mediaApi } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { MembershipBadgeCard } from '@/components/PremiumBadge';
import { useTranslation } from '@/i18n';
import { resolveImageUrl } from '@/utils/imageUrl';
import { PhoneInput } from '@/components/common';
import { normalizePhoneForPayload, splitPhone } from '@/utils/phone';

const { colors, radius } = theme;

const MAX_BIO_LENGTH = 500; // Backend DTO (UpdateProfileDto) bio'yu 500 ile sınırlar — web ile aynı.

// 18+ kontrolü (web ile parite): doğum tarihi en geç bugünden 18 yıl önce olmalı.
const minBirthDate = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 18);
  return d;
};

const createProfileSchema = (isBusinessTier: boolean) =>
  z.object({
    displayName: z.string().min(2, 'İsim en az 2 karakter olmalı').max(50),
    bio: z
      .string()
      .max(MAX_BIO_LENGTH, `Biyografi en fazla ${MAX_BIO_LENGTH} karakter olabilir`)
      .optional()
      .or(z.literal('')),
    phone: z.string().max(20).optional().or(z.literal('')),
    birthDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Lütfen geçerli bir doğum tarihi seçin')
      .refine((val) => new Date(val) <= minBirthDate(), '18 yaşından büyük olmalısınız')
      .optional()
      .or(z.literal('')),
    // Kurumsal (business tier) — web ile parite. Business ise firma adı zorunlu.
    companyName: isBusinessTier
      ? z.string().min(2, 'Şirket adı zorunludur').max(120)
      : z.string().max(120).optional().or(z.literal('')),
    taxId: z.string().max(20).optional().or(z.literal('')),
    taxOffice: z.string().max(120).optional().or(z.literal('')),
  });

type ProfileForm = {
  displayName: string;
  bio?: string;
  phone?: string;
  birthDate?: string;
  companyName?: string;
  taxId?: string;
  taxOffice?: string;
};

export default function EditProfileScreen() {
  const { t } = useTranslation();
  const { user, isAuthenticated, refreshUserData } = useAuthStore();
  const queryClient = useQueryClient();

  const [avatar, setAvatar] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string; variant?: 'default' | 'success' | 'danger' }>({
    visible: false,
    message: '',
  });

  const isBusinessTier = (user as any)?.membershipTier === 'business';

  // Kayıtlı numara "+90532…" formatında gelir — ülke kodu + formatlı lokal parçaya ayır.
  const [phoneCountryCode, setPhoneCountryCode] = useState(
    () => splitPhone((user as any)?.phone || '').countryCode,
  );

  const { control, handleSubmit, formState: { errors }, watch } = useForm<ProfileForm>({
    resolver: zodResolver(createProfileSchema(isBusinessTier)),
    defaultValues: {
      displayName: user?.displayName || '',
      bio: user?.bio || '',
      phone: splitPhone((user as any)?.phone || '').phone,
      // İlk 10 karakteri al ("1990-01-31T00:00:00Z" -> "1990-01-31"); toISOString
      // saat dilimi kaymasından kaçınmak için Date round-trip'i yapma.
      birthDate: (user as any)?.birthDate ? String((user as any).birthDate).slice(0, 10) : '',
      companyName: (user as any)?.companyName || '',
      taxId: (user as any)?.taxId || '',
      taxOffice: (user as any)?.taxOffice || '',
    },
  });

  useEffect(() => {
    if (user?.avatar) {
      setAvatar(user.avatar);
    }
  }, [user]);

  const updateMutation = useMutation({
    mutationFn: async (data: ProfileForm) => {
      // 1. Avatar yerel olarak değiştiyse önce /media/upload/avatar'a yükle (web ile aynı akış),
      //    dönen anahtarı (key) avatarUrl olarak JSON PATCH ile gönder.
      let avatarUrl: string | undefined;
      if (avatar && avatar !== user?.avatar && !avatar.startsWith('http')) {
        const uploadRes = await mediaApi.uploadAvatar({
          uri: avatar,
          name: 'avatar.jpg',
          type: 'image/jpeg',
        });
        avatarUrl = uploadRes.data?.key ?? uploadRes.data?.url;
      }

      const payload: Record<string, any> = {
        displayName: data.displayName,
        // Boş bırakılırsa '' gönderilir (numara silme); doluysa "+90…" normalize edilir.
        phone: data.phone ? normalizePhoneForPayload(data.phone, phoneCountryCode) : data.phone,
        bio: data.bio,
        birthDate: data.birthDate,
      };
      if (avatarUrl) payload.avatarUrl = avatarUrl;

      // Kurumsal alanlar yalnızca business tier'da gönderilir (web ile parite).
      // Backend, non-business'ta companyName/taxId'yi yalnızca isCorporateSeller=true ile işler.
      if (isBusinessTier) {
        payload.companyName = data.companyName;
        payload.taxId = data.taxId;
        payload.taxOffice = data.taxOffice;
        payload.isCorporateSeller = !!data.companyName;
      }

      // Boş string'leri undefined'a çevir (validation hatalarını önlemek için — web ile aynı).
      Object.keys(payload).forEach((key) => {
        if (payload[key] === '') payload[key] = undefined;
      });

      return userApi.updateProfile(payload);
    },
    onSuccess: async () => {
      // Store'u taze /users/me ile güncelle: mapApiUserToUser, API'nin döndürdüğü
      // 'avatarUrl' alanını UI'ın okuduğu 'avatar' alanına eşler. Aksi halde
      // updateUser ham yanıtı sığ merge ettiği için 'avatar' bayat kalır ve
      // profilde yeni foto görünmez. Web'deki refreshUser() ile parite.
      await refreshUserData();
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
  const companyNameValue = watch('companyName');

  if (!isAuthenticated) {
    return (
      <View style={styles.centeredContainer}>
        <Text variant="h3">Giriş Yapın</Text>
        <Button variant="primary" title="Giriş Yap" onPress={() => router.push('/(auth)/login')} style={{ alignSelf: 'center' }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={t('mobile.settingsEditProfile')}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
        right={
          <TouchableOpacity onPress={handleSubmit(onSubmit)}>
            <Text style={styles.saveButton}>{t('mobile.save')}</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Avatar Section */}
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={pickAvatar}>
            {avatar ? (
              <Image source={{ uri: resolveImageUrl(avatar) }} style={styles.avatar} />
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

        {/* Personal Information (web: Kişisel Bilgiler) */}
        <Card style={styles.card}>
          <Text variant="h3" style={styles.sectionTitle}>Kişisel Bilgiler</Text>

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

          {/* E-posta — salt okunur (web ile parite) */}
          <Input
            label="E-posta Adresi"
            value={user?.email || ''}
            editable={false}
            containerStyle={styles.input}
          />
          <Text variant="bodySm" style={styles.hintText}>
            🔒 E-posta değişikliği için destek ile iletişime geçin
          </Text>

          <Controller
            control={control}
            name="phone"
            render={({ field: { onChange, value } }) => (
              <PhoneInput
                label="Telefon"
                countryCode={phoneCountryCode}
                onCountryCodeChange={setPhoneCountryCode}
                phone={value ?? ''}
                onPhoneChange={onChange}
                containerStyle={styles.input}
                error={errors.phone?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="birthDate"
            render={({ field: { onChange, value } }) => (
              <DateField
                label="Doğum Tarihi"
                value={value}
                onChange={onChange}
                placeholder="Tarih seçin"
                maximumDate={minBirthDate()}
                containerStyle={styles.input}
                error={errors.birthDate?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="bio"
            render={({ field: { onChange, value } }) => (
              <Input
                label={`Hakkımda (${bioLength}/${MAX_BIO_LENGTH})`}
                value={value}
                onChangeText={onChange}
                multiline
                numberOfLines={4}
                maxLength={MAX_BIO_LENGTH}
                containerStyle={styles.input}
                placeholder={t("mobile.bioPlaceholder")}
                error={errors.bio?.message}
              />
            )}
          />
        </Card>

        {/* İşletme Bilgileri (Business tier) — web ile parite */}
        {isBusinessTier && (
          <Card style={styles.card}>
            <View style={styles.businessHeader}>
              <View style={styles.premiumFeatureHeader}>
                <MaterialCommunityIcons name="office-building" size={20} color={colors.primary[600]!} />
                <Text variant="h3" style={styles.premiumFeatureTitle}>İşletme Bilgileri</Text>
              </View>
              <View style={styles.tierBadge}>
                <Text variant="bodySm" style={styles.tierBadgeText}>İş Üyeliği</Text>
              </View>
            </View>

            <Controller
              control={control}
              name="companyName"
              render={({ field: { onChange, value } }) => (
                <Input
                  label="Şirket / Ticari Unvan *"
                  value={value}
                  onChangeText={onChange}
                  placeholder="ABC Ltd. Şti."
                  containerStyle={styles.input}
                  error={errors.companyName?.message}
                />
              )}
            />
            {!companyNameValue && (
              <Text variant="bodySm" style={styles.warningText}>
                ⚠️ İşletme panelini kullanmak için şirket adı zorunludur
              </Text>
            )}

            <Controller
              control={control}
              name="taxId"
              render={({ field: { onChange, value } }) => (
                <Input
                  label="Vergi Kimlik No"
                  value={value}
                  onChangeText={(text) => onChange(text.replace(/\D/g, '').slice(0, 11))}
                  keyboardType="number-pad"
                  placeholder="1234567890"
                  containerStyle={styles.input}
                  error={errors.taxId?.message}
                />
              )}
            />

            <Controller
              control={control}
              name="taxOffice"
              render={({ field: { onChange, value } }) => (
                <Input
                  label="Vergi Dairesi"
                  value={value}
                  onChangeText={onChange}
                  placeholder="Kadıköy VD"
                  containerStyle={styles.input}
                  error={errors.taxOffice?.message}
                />
              )}
            />

            <View style={styles.infoBox}>
              <Text variant="bodySm" style={styles.infoBoxText}>
                ℹ️ Kurumsal satıcı bilgileri fatura kesiminde kullanılır. Yanlış bilgi girişi yasal sorumluluk doğurabilir.
              </Text>
            </View>
          </Card>
        )}

        {/* Submit Button */}
        <Button
          variant="primary"
          fullWidth
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
  warningText: {
    color: colors.primary[600]!,
    marginTop: -6,
    marginBottom: 8,
  },
  premiumFeatureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  premiumFeatureTitle: {
    marginLeft: 8,
    color: colors.primary[700]!,
  },
  businessHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  tierBadge: {
    backgroundColor: colors.primary[50]!,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full ?? 999,
  },
  tierBadgeText: {
    color: colors.primary[600]!,
    fontWeight: '600',
  },
  infoBox: {
    backgroundColor: colors.info[50]!,
    borderWidth: 1,
    borderColor: colors.info[100]!,
    padding: 12,
    borderRadius: radius.md,
    marginTop: 4,
  },
  infoBoxText: {
    color: colors.info[700]!,
  },
  submitButton: {
    marginTop: 8,
  },
});

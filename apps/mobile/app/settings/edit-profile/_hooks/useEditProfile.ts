import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { userApi, mediaApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { normalizePhoneForPayload, splitPhone } from '@/utils/phone';
import { createProfileSchema, type ProfileForm } from '../_lib/schema';

/**
 * Edit-profile controller — owns the RHF+zod form, the avatar pick + upload,
 * the phone country-code, the update mutation (avatar upload → JSON PATCH) and
 * the snackbar. Lifted verbatim from the monolithic screen (§12).
 */
export function useEditProfile() {
  const { user, isAuthenticated, refreshUserData } = useAuthStore();
  const queryClient = useQueryClient();

  const [avatar, setAvatar] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{
    visible: boolean;
    message: string;
    variant?: 'default' | 'success' | 'danger';
  }>({ visible: false, message: '' });

  const isBusinessTier = (user as any)?.membershipTier === 'business';

  // Kayıtlı numara "+90532…" formatında gelir — ülke kodu + formatlı lokal parçaya ayır.
  const [phoneCountryCode, setPhoneCountryCode] = useState(
    () => splitPhone((user as any)?.phone || '').countryCode,
  );

  const {
    control,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<ProfileForm>({
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

  return {
    user,
    isAuthenticated,
    control,
    errors,
    handleSubmit,
    onSubmit,
    avatar,
    pickAvatar,
    phoneCountryCode,
    setPhoneCountryCode,
    isBusinessTier,
    bioLength,
    companyNameValue,
    updateMutation,
    snackbar,
    setSnackbar,
  };
}

export type EditProfileController = ReturnType<typeof useEditProfile>;

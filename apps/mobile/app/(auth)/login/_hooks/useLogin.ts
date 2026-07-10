import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { appAlert } from '@tarodan/ui-native';
import { authApi } from '../../../../src/services/api';
import { signInWithGoogle } from '../../../../src/services/googleSignin';
import { signInWithApple, isAppleAvailable } from '../../../../src/services/appleSignin';
import { useAuthStore } from '../../../../src/stores/authStore';
import { loginSchema, type LoginForm } from '../_lib/schema';

/**
 * Login controller — owns the RHF form (zod), the login + resend-verification
 * mutations, Google/Apple social sign-in, guest-continue, and the Maestro
 * fallback submit. Lifted verbatim from the monolithic LoginScreen.
 */
export function useLogin() {
  const { login } = useAuthStore();
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });
  const { handleSubmit, getValues } = form;

  const loginMutation = useMutation({
    mutationFn: (data: LoginForm) => authApi.login(data.email, data.password),
    onSuccess: async (response) => {
      const data = response.data as Record<string, unknown> & {
        tokens?: { accessToken?: string; refreshToken?: string };
        accessToken?: string;
        refreshToken?: string;
        user?: {
          email?: string;
        };
      };
      const accessToken = data.tokens?.accessToken || data.accessToken;
      const refreshToken = data.tokens?.refreshToken || data.refreshToken;
      const user = data.user;
      setErrorMessage(null);

      console.log('✅ Login başarılı:', user?.email);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await login(accessToken!, user as any, refreshToken);

      // Doğrulanmamış e-posta banner'ı yalnızca login HATASI ('verify/doğrula')
      // ile tetiklenir (onError); başarılı login her zaman doğrulanmış kullanıcıdandır.
      // Kurumsal yükseltme kontrolü web gibi /users/me'den okunur (login response'unda
      // companyName/taxId/membership yok).
      try {
        const profileResponse = (await authApi.getProfile()).data as {
          user?: Record<string, unknown>;
        } & Record<string, unknown>;
        const currentUser = (profileResponse?.user ?? profileResponse) as {
          companyName?: string | null;
          taxId?: string | null;
          membershipTier?: string | null;
          membership?: { tier?: { type?: string; name?: string } | null } | null;
        };
        const membershipTier =
          currentUser?.membership?.tier?.type ||
          currentUser?.membership?.tier?.name ||
          currentUser?.membershipTier ||
          'free';
        const isBusinessTier = String(membershipTier).toLowerCase().includes('business');
        const hasBusinessInfo = !!(currentUser?.companyName && currentUser?.taxId);
        if (hasBusinessInfo && !isBusinessTier) {
          appAlert(
            'Kurumsal Üyelik',
            'İşletme bilgilerinizi tamamlamışsınız. Kurumsal üyeliğe geçerek avantajlardan yararlanabilirsiniz.',
            [
              { text: 'Sonra', onPress: () => router.replace('/' as never), style: 'cancel' },
              { text: 'Üyeliğe Geç', onPress: () => router.replace('/membership' as never) },
            ],
          );
          return;
        }
      } catch {
        // Profil çekilemese bile login akışı devam etsin
      }

      router.replace('/' as never);
    },
    onError: (error: unknown) => {
      const e = error as { response?: { data?: { message?: string } }; message?: string };
      const msg = e?.response?.data?.message || e?.message || 'Giriş başarısız.';
      console.log('❌ Login hatası:', msg);
      const lower = msg.toLowerCase();
      if (lower.includes('doğrula') || lower.includes('verify') || lower.includes('doğrulanmadı')) {
        setUnverifiedEmail(getValues('email'));
        setErrorMessage(null);
      } else {
        setErrorMessage(msg);
      }
    },
  });

  const resendVerificationMutation = useMutation({
    mutationFn: () => authApi.resendVerification(unverifiedEmail ?? getValues('email')),
    onSuccess: () => {
      appAlert('Gönderildi', 'Doğrulama bağlantısı e-posta adresinize tekrar gönderildi.');
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      appAlert('Hata', err?.response?.data?.message || 'Doğrulama bağlantısı gönderilemedi.');
    },
  });

  useEffect(() => {
    isAppleAvailable().then(setAppleAvailable);
  }, []);

  const handleGoogle = async () => {
    if (googleLoading) return;
    setGoogleLoading(true);
    try {
      const idToken = await signInWithGoogle();
      const response = await authApi.loginWithGoogle(idToken);
      const data = response.data as any;
      const accessToken = data.tokens?.accessToken || data.accessToken;
      const refreshToken = data.tokens?.refreshToken || data.refreshToken;
      const user = data.user;
      if (!accessToken) {
        appAlert('Hata', 'Giriş yanıtı beklenmedik biçimde geldi. Lütfen tekrar deneyin.');
        return;
      }
      await login(accessToken, user, refreshToken);
      router.push('/' as never);
    } catch (e: any) {
      // İptal sessiz geçilir; diğer her hata KULLANICIYA gösterilir (önceden
      // sessiz yutuluyordu → "takılıyor" görüntüsü). Native status code'u da
      // ekle: DEVELOPER_ERROR → Google Cloud'da Android OAuth client/SHA-1 eksik.
      if (e?.code === 'SIGN_IN_CANCELLED' || e?.code === '-5') return;
      const apiMsg = e?.response?.data?.message;
      const detail = apiMsg || e?.message || 'Bilinmeyen hata';
      const code = e?.code ? ` (kod: ${e.code})` : '';
      appAlert('Google ile giriş başarısız', `${detail}${code}`);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleApple = async () => {
    if (appleLoading) return;
    setAppleLoading(true);
    try {
      const { identityToken, fullName } = await signInWithApple();
      const response = await authApi.loginWithApple(identityToken, fullName);
      const data = response.data as any;
      const accessToken = data.tokens?.accessToken || data.accessToken;
      const refreshToken = data.tokens?.refreshToken || data.refreshToken;
      const user = data.user;
      if (!accessToken) {
        appAlert('Hata', 'Giriş yanıtı beklenmedik biçimde geldi. Lütfen tekrar deneyin.');
        return;
      }
      await login(accessToken, user, refreshToken);
      router.push('/' as never);
    } catch (e: any) {
      // Kullanıcı iptali sessiz geçilir.
      if (e?.code === 'ERR_REQUEST_CANCELED') return;
      const apiMsg = e?.response?.data?.message;
      const detail = apiMsg || e?.message || 'Bilinmeyen hata';
      const code = e?.code ? ` (kod: ${e.code})` : '';
      appAlert('Apple ile giriş başarısız', `${detail}${code}`);
    } finally {
      setAppleLoading(false);
    }
  };

  const onSubmit = (data: LoginForm) => {
    setErrorMessage(null);
    loginMutation.mutate(data);
  };

  /**
   * Misafir olarak devam et: giriş yapmadan akışa dön. Login ekranı her zaman
   * router.push ile açıldığı için geri dönülecek bir ekran varsa oraya
   * (örn. checkout misafir formu) döneriz; yoksa ana sayfaya yönlendiririz.
   */
  const continueAsGuest = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/' as never);
    }
  };

  /**
   * Maestro fallback: hook-form handleSubmit bazen Maestro tap akışında
   * silently fail oluyor. Test ortamında getValues() ile direkt mutate.
   * Production'da EXPO_PUBLIC_MAESTRO unset → branch dead-code.
   */
  const handleLoginPress = () => {
    if (process.env.EXPO_PUBLIC_MAESTRO === '1') {
      const v = getValues();
      if (v?.email && v?.password) {
        setErrorMessage(null);
        loginMutation.mutate({ email: v.email, password: v.password });
        return;
      }
    }
    handleSubmit(onSubmit)();
  };

  const errorBannerVisible = errorMessage || loginMutation.isError;

  return {
    form,
    unverifiedEmail,
    setUnverifiedEmail,
    errorMessage,
    googleLoading,
    appleLoading,
    appleAvailable,
    loginMutation,
    resendVerificationMutation,
    handleGoogle,
    handleApple,
    continueAsGuest,
    handleLoginPress,
    errorBannerVisible,
  };
}

export type LoginController = ReturnType<typeof useLogin>;

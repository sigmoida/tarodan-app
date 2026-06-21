import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  Alert as UIAlert,
  Button,
  HStack,
  Input,
  Screen,
  Text,
  VStack,
  appAlert,
} from '@tarodan/ui-native';
import { authApi } from '../../src/services/api';
import { signInWithGoogle, isGoogleConfigured } from '../../src/services/googleSignin';
import { useAuthStore } from '../../src/stores/authStore';

/**
 * Şifre minimum kuralı web ile aynı: 8+ karakter, küçük + büyük harf + rakam.
 * Login için sadece "boş değil" kontrolü yapıyoruz — eski şifreyle de giriş yapılabilsin
 * (zayıf şifre uyarısı oturum açtıktan sonra gösterilir). Web pattern'i.
 */
const loginSchema = z.object({
  email: z.string().email('Geçerli e-posta girin'),
  password: z.string().min(1, 'Şifre boş olamaz'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { login } = useAuthStore();
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { control, handleSubmit, formState: { errors }, getValues } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

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

  const handleGoogle = async () => {
    try {
      const idToken = await signInWithGoogle();
      const response = await authApi.loginWithGoogle(idToken);
      const { tokens, user } = response.data as any;
      await login(tokens.accessToken, user, tokens.refreshToken);
      router.push('/' as never);
    } catch (e: any) {
      // kullanıcı iptal edebilir; sessiz geç veya toast göster
      if (e?.code !== 'SIGN_IN_CANCELLED') {
        console.warn('Google sign-in failed', e?.message);
      }
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

  return (
    <Screen center>
      <Pressable
        testID="login-back-button"
        onPress={continueAsGuest}
        accessibilityRole="button"
        accessibilityLabel="Ana sayfaya dön"
        hitSlop={12}
        style={[styles.backButton, { top: insets.top + 8 }]}
      >
        <Ionicons name="arrow-back" size={26} color="#111827" />
      </Pressable>

      <VStack gap={4}>
        <Text variant="displaySm" tone="primary" align="center">
          Tarodan
        </Text>
        <Text variant="body" tone="muted" align="center">
          Diecast Model Araba Pazaryeri
        </Text>

        {unverifiedEmail ? (
          <UIAlert
            variant="warning"
            title="E-posta doğrulanmadı"
            testID="unverified-email-banner"
          >
            <Text variant="bodySm">
              <Text variant="bodySm" weight="bold">
                {unverifiedEmail}
              </Text>{' '}
              adresi henüz doğrulanmadı. Hesabınızı kullanmak için e-posta adresinize
              gönderilen bağlantıya tıklayın veya yeni bir bağlantı isteyin.
            </Text>
            <HStack gap={2} style={{ marginTop: 8 }}>
              <Button
                variant="outline"
                size="sm"
                title={resendVerificationMutation.isPending ? 'Gönderiliyor…' : 'Tekrar Gönder'}
                onPress={() => resendVerificationMutation.mutate()}
                disabled={resendVerificationMutation.isPending}
              />
              <Button
                variant="ghost"
                size="sm"
                title="Kapat"
                onPress={() => setUnverifiedEmail(null)}
              />
            </HStack>
          </UIAlert>
        ) : null}

        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, value } }) => (
            <Input
              testID="login-email-input"
              label="E-posta"
              value={value}
              onChangeText={onChange}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              error={errors.email?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, value } }) => (
            <Input
              testID="login-password-input"
              label="Şifre"
              value={value}
              onChangeText={onChange}
              // Maestro iOS secureTextEntry'ye inputText gönderemiyor;
              // EXPO_PUBLIC_MAESTRO=1 ile maskeyi kapat. Production: daima maskeli.
              secureTextEntry={process.env.EXPO_PUBLIC_MAESTRO !== '1'}
              togglePasswordVisibility
              autoComplete="password"
              error={errors.password?.message}
            />
          )}
        />

        {errorBannerVisible ? (
          <Text
            testID="login-error-banner"
            variant="bodySm"
            tone="danger"
            align="center"
          >
            {errorMessage || 'Giriş başarısız.'}
          </Text>
        ) : null}
        {process.env.EXPO_PUBLIC_MAESTRO === '1' && loginMutation.isError && !errorMessage ? (
          <Text testID="login-error-banner-fallback" style={{ height: 0, opacity: 0 }}>
            login-error
          </Text>
        ) : null}

        <Button
          testID="login-submit-button"
          variant="primary"
          size="lg"
          fullWidth
          title="Giriş Yap"
          onPress={handleLoginPress}
          isLoading={loginMutation.isPending}
          disabled={loginMutation.isPending}
        />

        <Button
          testID="continue-as-guest-button"
          variant="outline"
          size="lg"
          fullWidth
          title="Misafir Olarak Devam Et"
          onPress={continueAsGuest}
          disabled={loginMutation.isPending}
        />

        {isGoogleConfigured() && (
          <Pressable
            testID="login-google-button"
            onPress={handleGoogle}
            accessibilityRole="button"
            accessibilityLabel="Google ile devam et"
            disabled={loginMutation.isPending}
            style={styles.googleButton}
          >
            <Ionicons name="logo-google" size={18} color="#111827" />
            <Text variant="body" weight="semibold">
              Google ile devam et
            </Text>
          </Pressable>
        )}

        <Button
          variant="ghost"
          fullWidth
          title="Şifremi Unuttum"
          onPress={() => router.push('/(auth)/forgot-password' as never)}
        />

        <HStack justify="center" wrap gap={1} style={{ marginTop: 16 }}>
          <Text variant="body">Hesabınız yok mu?</Text>
          <Text
            variant="body"
            tone="primary"
            weight="semibold"
            onPress={() => router.push('/(auth)/register' as never)}
          >
            Kayıt Ol
          </Text>
        </HStack>

        <HStack justify="center" wrap gap={1}>
          <Text variant="bodySm" tone="muted">
            İşletmeyseniz
          </Text>
          <Text
            variant="bodySm"
            tone="primary"
            weight="semibold"
            onPress={() => router.push('/(auth)/register-business' as never)}
          >
            Kurumsal Kayıt
          </Text>
        </HStack>
      </VStack>
    </Screen>
  );
}

const styles = StyleSheet.create({
  backButton: {
    position: 'absolute',
    left: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
});

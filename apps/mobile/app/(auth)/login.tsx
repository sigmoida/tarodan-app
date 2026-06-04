import { useState } from 'react';
import { Alert } from 'react-native';
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
} from '@tarodan/ui-native';
import { authApi } from '../../src/services/api';
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
          isEmailVerified?: boolean;
          companyName?: string;
          taxId?: string;
          membershipTier?: string;
        };
      };
      const accessToken = data.tokens?.accessToken || data.accessToken;
      const refreshToken = data.tokens?.refreshToken || data.refreshToken;
      const user = data.user;
      setErrorMessage(null);

      console.log('✅ Login başarılı:', user?.email);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await login(accessToken!, user as any, refreshToken);

      if (user && !user.isEmailVerified) {
        setUnverifiedEmail(user.email ?? null);
      }

      const hasBusinessInfo = !!(user?.companyName && user?.taxId);
      const isBusinessTier = user?.membershipTier === 'business';
      if (hasBusinessInfo && !isBusinessTier) {
        Alert.alert(
          'Kurumsal Üyelik',
          'İşletme bilgilerinizi tamamlamışsınız. Kurumsal üyeliğe geçerek avantajlardan yararlanabilirsiniz.',
          [
            { text: 'Sonra', onPress: () => router.replace('/' as never), style: 'cancel' },
            { text: 'Üyeliğe Geç', onPress: () => router.replace('/membership/checkout' as never) },
          ],
        );
        return;
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
    mutationFn: () => authApi.resendVerification(),
    onSuccess: () => {
      Alert.alert('Gönderildi', 'Doğrulama bağlantısı e-posta adresinize tekrar gönderildi.');
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      Alert.alert('Hata', err?.response?.data?.message || 'Doğrulama bağlantısı gönderilemedi.');
    },
  });

  const onSubmit = (data: LoginForm) => {
    setErrorMessage(null);
    loginMutation.mutate(data);
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

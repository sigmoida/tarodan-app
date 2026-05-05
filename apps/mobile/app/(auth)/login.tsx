import { View, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { Button, useTheme, Banner, ActivityIndicator } from 'react-native-paper';
import { Text, TextInput } from '../../src/components/common';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { authApi } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';
import { TarodanColors } from '../../src/theme';

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
  const theme = useTheme();
  const { login } = useAuthStore();

  /** Login sonrası doğrulanmamış e-posta için banner. */
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  /** Server'dan gelen ham hata mesajı (UI'da gösterilir). */
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { control, handleSubmit, formState: { errors }, getValues } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  // Web ile aynı endpoint: POST /auth/login
  const loginMutation = useMutation({
    mutationFn: (data: LoginForm) => authApi.login(data.email, data.password),
    onSuccess: async (response) => {
      const data: any = response.data;
      const accessToken = data.tokens?.accessToken || data.accessToken;
      const refreshToken = data.tokens?.refreshToken || data.refreshToken;
      const user = data.user;
      setErrorMessage(null);

      console.log('✅ Login başarılı:', user?.email);
      await login(accessToken, user, refreshToken);

      // Web pattern: e-posta doğrulanmadıysa bilgi banner'ı göster.
      if (user && !user.isEmailVerified) {
        setUnverifiedEmail(user.email);
        // Yine de devam et — kullanıcı kapalı işlemleri görmek için banner'a "tekrar gönder" diyebilir.
      }

      // Web pattern: işletme bilgileri var ama Business tier değil ise membership upgrade'e yönlendir.
      const hasBusinessInfo = !!(user?.companyName && user?.taxId);
      const isBusinessTier = user?.membershipTier === 'business';
      if (hasBusinessInfo && !isBusinessTier) {
        Alert.alert(
          'Kurumsal Üyelik',
          'İşletme bilgilerinizi tamamlamışsınız. Kurumsal üyeliğe geçerek avantajlardan yararlanabilirsiniz.',
          [
            { text: 'Sonra', onPress: () => router.replace('/' as any), style: 'cancel' },
            { text: 'Üyeliğe Geç', onPress: () => router.replace('/membership/checkout' as any) },
          ],
        );
        return;
      }

      router.replace('/' as any);
    },
    onError: (error: any) => {
      const msg: string = error?.response?.data?.message || error?.message || 'Giriş başarısız.';
      console.log('❌ Login hatası:', msg);
      // Backend bazen "doğrulayınız" / "verify" / "doğrulanmadı" gibi mesajla 401/403 döner.
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
    onError: (e: any) => {
      Alert.alert('Hata', e?.response?.data?.message || 'Doğrulama bağlantısı gönderilemedi.');
    },
  });

  const onSubmit = (data: LoginForm) => {
    console.log('🟧 LOGIN onSubmit fired', data?.email);
    setErrorMessage(null);
    loginMutation.mutate(data);
  };

  /**
   * Maestro fallback: hook-form handleSubmit bazen Paper Button + Maestro tap
   * kombinasyonunda silently fail oluyor (validation çağrılıyor ama mutate
   * hiç tetiklenmiyor). E2E ortamında getValues() ile direkt mutate çağır.
   * Production'da bu branch dead-code (EXPO_PUBLIC_MAESTRO unset).
   */
  const handleLoginPress = () => {
    if (process.env.EXPO_PUBLIC_MAESTRO === '1') {
      const v = getValues();
      console.log('🤖 Maestro direct submit', v?.email);
      if (v?.email && v?.password) {
        setErrorMessage(null);
        loginMutation.mutate({ email: v.email, password: v.password });
        return;
      }
    }
    handleSubmit(onSubmit)();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
        <Text variant="displaySmall" style={{ textAlign: 'center', marginBottom: 8, color: theme.colors.primary }}>
          Tarodan
        </Text>
        <Text variant="bodyLarge" style={{ textAlign: 'center', marginBottom: 24, color: theme.colors.outline }}>
          Diecast Model Araba Pazaryeri
        </Text>

        {unverifiedEmail ? (
          <Banner
            visible
            icon={({ size }) => (
              <Ionicons name="mail-unread-outline" size={size} color={TarodanColors.warning} />
            )}
            style={{ marginBottom: 12, backgroundColor: TarodanColors.warningLight }}
            actions={[
              {
                label: resendVerificationMutation.isPending ? 'Gönderiliyor…' : 'Tekrar Gönder',
                onPress: () => resendVerificationMutation.mutate(),
              },
              { label: 'Kapat', onPress: () => setUnverifiedEmail(null) },
            ]}
          >
            <Text testID="unverified-email-banner">
              <Text style={{ fontWeight: '700' }}>{unverifiedEmail}</Text> adresi henüz
              doğrulanmadı. Hesabınızı kullanmak için e-posta adresinize gönderilen bağlantıya
              tıklayın veya yeni bir bağlantı isteyin.
            </Text>
          </Banner>
        ) : null}

        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, value } }) => (
            <TextInput
              testID="login-email-input"
              label="E-posta"
              value={value}
              onChangeText={onChange}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              error={!!errors.email}
              style={{ marginBottom: 8 }}
            />
          )}
        />
        {errors.email ? (
          <Text variant="bodySmall" style={{ color: theme.colors.error, marginBottom: 8 }}>
            {errors.email.message}
          </Text>
        ) : null}

        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, value } }) => (
            <TextInput
              testID="login-password-input"
              label="Şifre"
              value={value}
              onChangeText={onChange}
              // Maestro iOS secureTextEntry'ye inputText gönderemiyor; test
              // ortamında EXPO_PUBLIC_MAESTRO=1 ile maskeyi kapat. Production
              // build'de bayrak yok → daima maskeli.
              secureTextEntry={process.env.EXPO_PUBLIC_MAESTRO !== '1'}
              autoComplete="password"
              error={!!errors.password}
              style={{ marginBottom: 8 }}
            />
          )}
        />
        {errors.password ? (
          <Text variant="bodySmall" style={{ color: theme.colors.error, marginBottom: 16 }}>
            {errors.password.message}
          </Text>
        ) : null}

        {errorMessage || loginMutation.isError ? (
          <Text
            testID="login-error-banner"
            variant="bodySmall"
            style={{ color: theme.colors.error, marginBottom: 16, textAlign: 'center' }}
          >
            {errorMessage || 'Giriş başarısız.'}
          </Text>
        ) : null}
        {/* Maestro-only sentinel: hata banner görünmediğinde de submit denendiğinde
            görünsün. Production'da EXPO_PUBLIC_MAESTRO unset → branch dead-code. */}
        {process.env.EXPO_PUBLIC_MAESTRO === '1' && loginMutation.isError && !errorMessage ? (
          <Text testID="login-error-banner-fallback" style={{ height: 0, opacity: 0 }}>
            login-error
          </Text>
        ) : null}

        <Button
          testID="login-submit-button"
          mode="contained"
          onPress={handleLoginPress}
          loading={loginMutation.isPending}
          disabled={loginMutation.isPending}
          style={{ marginBottom: 16 }}
        >
          Giriş Yap
        </Button>

        <Button mode="text" onPress={() => router.push('/(auth)/forgot-password' as any)}>
          Şifremi Unuttum
        </Button>

        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 24, flexWrap: 'wrap' }}>
          <Text variant="bodyMedium">Hesabınız yok mu? </Text>
          <Button mode="text" compact onPress={() => router.push('/(auth)/register' as any)}>
            Kayıt Ol
          </Button>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' }}>
          <Text variant="bodySmall" style={{ color: theme.colors.outline }}>
            İşletmeyseniz{' '}
          </Text>
          <Button mode="text" compact onPress={() => router.push('/(auth)/register-business' as any)}>
            Kurumsal Kayıt
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

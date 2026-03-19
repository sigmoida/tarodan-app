import { useState } from 'react';
import { View, KeyboardAvoidingView, Platform, TouchableOpacity, StyleSheet } from 'react-native';
import { Text, TextInput, Button, useTheme, Banner } from 'react-native-paper';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { authApi } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';

const loginSchema = z.object({
  email: z.string().email('Geçerli email girin'),
  password: z.string().min(6, 'Şifre en az 6 karakter olmalı'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginScreen() {
  const theme = useTheme();
  const { login } = useAuthStore();
  const params = useLocalSearchParams<{ redirect?: string }>();
  const [showPassword, setShowPassword] = useState(false);
  const [showVerificationBanner, setShowVerificationBanner] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [resending, setResending] = useState(false);

  const { control, handleSubmit, formState: { errors }, getValues } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const loginMutation = useMutation({
    mutationFn: (data: LoginForm) => authApi.login(data.email, data.password),
    onSuccess: async (response) => {
      const data = response.data;
      const accessToken = data.tokens?.accessToken || data.accessToken;
      const refreshToken = data.tokens?.refreshToken || data.refreshToken;
      const user = data.user;

      await login(accessToken, user, refreshToken);

      const redirectTo = params.redirect;
      if (redirectTo) {
        router.replace(redirectTo as any);
      } else {
        router.replace('/');
      }
    },
    onError: (error: any) => {
      const msg = error.response?.data?.message || '';
      const msgLower = typeof msg === 'string' ? msg.toLowerCase() : '';
      if (msgLower.includes('verify') || msgLower.includes('doğrula') || msgLower.includes('onay')) {
        setShowVerificationBanner(true);
        setVerificationEmail(getValues('email'));
      }
    },
  });

  const handleResendVerification = async () => {
    if (!verificationEmail) return;
    setResending(true);
    try {
      await authApi.resendVerification(verificationEmail);
    } catch {}
    setResending(false);
  };

  const onSubmit = (data: LoginForm) => {
    setShowVerificationBanner(false);
    loginMutation.mutate(data);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <TouchableOpacity
          onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
          style={{ position: 'absolute', top: 50, left: 16, zIndex: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' }}
        >
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>

        <Text variant="displaySmall" style={{ textAlign: 'center', marginBottom: 8, color: theme.colors.primary }}>
          Tarodan
        </Text>
        <Text variant="bodyLarge" style={{ textAlign: 'center', marginBottom: 32, color: theme.colors.outline }}>
          Diecast Model Araba Pazaryeri
        </Text>

        {showVerificationBanner && (
          <Banner
            visible
            icon="email-alert-outline"
            actions={[
              { label: resending ? 'Gönderiliyor...' : 'Tekrar Gönder', onPress: handleResendVerification },
              { label: 'Kapat', onPress: () => setShowVerificationBanner(false) },
            ]}
            style={{ marginBottom: 16, borderRadius: 8 }}
          >
            E-posta adresiniz doğrulanmamış. Lütfen gelen kutunuzu kontrol edin veya doğrulama bağlantısını tekrar gönderin.
          </Banner>
        )}

        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, value } }) => (
            <TextInput
              label="E-posta"
              value={value}
              onChangeText={onChange}
              keyboardType="email-address"
              autoCapitalize="none"
              error={!!errors.email}
              style={{ marginBottom: 8 }}
            />
          )}
        />
        {errors.email && (
          <Text variant="bodySmall" style={{ color: theme.colors.error, marginBottom: 8 }}>
            {errors.email.message}
          </Text>
        )}

        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, value } }) => (
            <TextInput
              label="Şifre"
              value={value}
              onChangeText={onChange}
              secureTextEntry={!showPassword}
              error={!!errors.password}
              style={{ marginBottom: 8 }}
              right={
                <TextInput.Icon
                  icon={showPassword ? 'eye-off' : 'eye'}
                  onPress={() => setShowPassword(!showPassword)}
                />
              }
            />
          )}
        />
        {errors.password && (
          <Text variant="bodySmall" style={{ color: theme.colors.error, marginBottom: 16 }}>
            {errors.password.message}
          </Text>
        )}

        {loginMutation.isError && !showVerificationBanner && (
          <Text variant="bodySmall" style={{ color: theme.colors.error, marginBottom: 16, textAlign: 'center' }}>
            Giriş başarısız. Bilgilerinizi kontrol edin.
          </Text>
        )}

        <Button
          mode="contained"
          onPress={handleSubmit(onSubmit)}
          loading={loginMutation.isPending}
          disabled={loginMutation.isPending}
          style={{ marginBottom: 16 }}
        >
          Giriş Yap
        </Button>

        <Button mode="text" onPress={() => router.push('/(auth)/forgot-password')}>
          Şifremi Unuttum
        </Button>

        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 24 }}>
          <Text variant="bodyMedium">Hesabınız yok mu? </Text>
          <Button mode="text" compact onPress={() => router.push('/(auth)/register')}>
            Kayıt Ol
          </Button>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

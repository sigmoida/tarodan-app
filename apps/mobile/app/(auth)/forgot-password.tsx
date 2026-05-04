import { View, KeyboardAvoidingView, Platform } from 'react-native';
import { Button, useTheme } from 'react-native-paper';
import { Text, TextInput } from '../../src/components/common';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { authApi } from '../../src/services/api';

const forgotSchema = z.object({
  email: z.string().email('Geçerli email girin'),
});

type ForgotForm = z.infer<typeof forgotSchema>;

export default function ForgotPasswordScreen() {
  const theme = useTheme();
  const [sent, setSent] = useState(false);

  const { control, handleSubmit, formState: { errors } } = useForm<ForgotForm>({
    resolver: zodResolver(forgotSchema),
  });

  const forgotMutation = useMutation({
    mutationFn: (data: ForgotForm) => authApi.forgotPassword(data.email),
    onSuccess: () => {
      setSent(true);
    },
  });

  const onSubmit = (data: ForgotForm) => {
    forgotMutation.mutate(data);
  };

  if (sent) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: theme.colors.background }}>
        <Text variant="headlineSmall" style={{ marginBottom: 16 }}>Email Gönderildi</Text>
        <Text variant="bodyMedium" style={{ textAlign: 'center', marginBottom: 24, color: theme.colors.outline }}>
          Şifre sıfırlama linki email adresinize gönderildi. Lütfen gelen kutunuzu kontrol edin.
        </Text>
        <Button mode="contained" onPress={() => router.push('/(auth)/login')}>
          Giriş Sayfasına Dön
        </Button>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <Text variant="headlineSmall" style={{ textAlign: 'center', marginBottom: 8 }}>
          Şifremi Unuttum
        </Text>
        <Text variant="bodyMedium" style={{ textAlign: 'center', marginBottom: 32, color: theme.colors.outline }}>
          Email adresinizi girin, şifre sıfırlama linki göndereceğiz
        </Text>

        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, value } }) => (
            <TextInput
              testID="forgot-email-input"
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
          <Text variant="bodySmall" style={{ color: theme.colors.error, marginBottom: 16 }}>
            {errors.email.message}
          </Text>
        )}

        {forgotMutation.isError && (
          <Text variant="bodySmall" style={{ color: theme.colors.error, marginBottom: 16, textAlign: 'center' }}>
            Bir hata oluştu. Lütfen tekrar deneyin.
          </Text>
        )}

        <Button
          testID="forgot-submit-button"
          mode="contained"
          onPress={handleSubmit(onSubmit)}
          loading={forgotMutation.isPending}
          disabled={forgotMutation.isPending}
          style={{ marginBottom: 16 }}
        >
          Şifre Sıfırlama Linki Gönder
        </Button>

        <Button mode="text" onPress={() => router.back()}>
          Geri Dön
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}

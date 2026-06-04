import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Button, Input, Screen, Text, VStack } from '@tarodan/ui-native';
import { authApi } from '../../src/services/api';

const forgotSchema = z.object({
  email: z.string().email('Geçerli email girin'),
});

type ForgotForm = z.infer<typeof forgotSchema>;

export default function ForgotPasswordScreen() {
  const [sent, setSent] = useState(false);

  const { control, handleSubmit, formState: { errors } } = useForm<ForgotForm>({
    resolver: zodResolver(forgotSchema),
  });

  const forgotMutation = useMutation({
    mutationFn: (data: ForgotForm) => authApi.forgotPassword(data.email),
    onSuccess: () => setSent(true),
  });

  const onSubmit = (data: ForgotForm) => forgotMutation.mutate(data);

  if (sent) {
    return (
      <Screen center>
        <VStack gap={4} align="center">
          <Text variant="h1" align="center">
            Email Gönderildi
          </Text>
          <Text variant="body" tone="muted" align="center">
            Şifre sıfırlama linki email adresinize gönderildi. Lütfen gelen kutunuzu kontrol edin.
          </Text>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            title="Giriş Sayfasına Dön"
            onPress={() => router.push('/(auth)/login')}
          />
        </VStack>
      </Screen>
    );
  }

  return (
    <Screen center>
      <VStack gap={4}>
        <Text variant="h1" align="center">
          Şifremi Unuttum
        </Text>
        <Text variant="body" tone="muted" align="center">
          Email adresinizi girin, şifre sıfırlama linki göndereceğiz
        </Text>

        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, value } }) => (
            <Input
              testID="forgot-email-input"
              label="E-posta"
              value={value}
              onChangeText={onChange}
              keyboardType="email-address"
              autoCapitalize="none"
              error={errors.email?.message}
            />
          )}
        />

        {forgotMutation.isError ? (
          <Text variant="bodySm" tone="danger" align="center">
            Bir hata oluştu. Lütfen tekrar deneyin.
          </Text>
        ) : null}

        <Button
          testID="forgot-submit-button"
          variant="primary"
          size="lg"
          fullWidth
          title="Şifre Sıfırlama Linki Gönder"
          onPress={handleSubmit(onSubmit)}
          isLoading={forgotMutation.isPending}
          disabled={forgotMutation.isPending}
        />

        <Button variant="ghost" fullWidth title="Geri Dön" onPress={() => router.back()} />
      </VStack>
    </Screen>
  );
}

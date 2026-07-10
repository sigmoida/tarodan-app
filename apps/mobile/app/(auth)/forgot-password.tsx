import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Button, Input, Screen, Text, VStack, theme } from '@tarodan/ui-native';
import { authApi } from '@/services/api';
import { BrandLogo } from '@/components/BrandLogo';

const { colors } = theme;

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
      <Screen center style={styles.screen}>
        <VStack gap={5}>
          <View style={styles.brandHeader}>
            <BrandLogo />
          </View>
          <View style={styles.card}>
            <Text variant="h3" align="center">
              Email Gönderildi
            </Text>
            <Text variant="bodySm" tone="muted" align="center" style={{ marginTop: 8, marginBottom: 16 }}>
              Şifre sıfırlama linki email adresinize gönderildi. Lütfen gelen kutunuzu kontrol edin.
            </Text>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              title="Giriş Sayfasına Dön"
              onPress={() => router.push('/(auth)/login')}
            />
          </View>
        </VStack>
      </Screen>
    );
  }

  return (
    <Screen center style={styles.screen}>
      <VStack gap={5}>
        <View style={styles.brandHeader}>
          <BrandLogo />
        </View>

        <View style={styles.card}>
          <Text variant="h3" align="center">
            Şifremi Unuttum
          </Text>
          <Text variant="bodySm" tone="muted" align="center" style={{ marginTop: 8, marginBottom: 16 }}>
            Email adresinizi girin, şifre sıfırlama linki göndereceğiz
          </Text>

          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, value } }) => (
              <Input
                testID="forgot-email-input"
                label="E-posta"
                leftIconName="mail-outline"
                placeholder="ornek@eposta.com"
                value={value}
                onChangeText={onChange}
                keyboardType="email-address"
                autoCapitalize="none"
                error={errors.email?.message}
              />
            )}
          />

          {forgotMutation.isError ? (
            <Text variant="bodySm" tone="danger" align="center" style={{ marginBottom: 8 }}>
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

          <Button variant="ghost" fullWidth title="Geri Dön" onPress={() => router.back()} style={{ marginTop: 4 }} />
        </View>
      </VStack>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.primary[600]!,
  },
  brandHeader: {
    alignItems: 'center',
  },
  card: {
    width: '100%',
    backgroundColor: colors.surface.elevated,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
});

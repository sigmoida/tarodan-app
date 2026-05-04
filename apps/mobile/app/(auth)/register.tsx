import { View, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Button, Checkbox, useTheme } from 'react-native-paper';
import { Text, TextInput } from '../../src/components/common';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { authApi } from '../../src/services/api';
import {
  displayNameSchema,
  emailSchema,
  strongPasswordSchema,
} from '../../src/utils/validation';

const registerSchema = z.object({
  displayName: displayNameSchema,
  email: emailSchema,
  password: strongPasswordSchema,
  confirmPassword: z.string(),
  acceptTerms: z.boolean().refine(val => val, 'Kullanım koşullarını kabul etmelisiniz'),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Şifreler eşleşmiyor',
  path: ['confirmPassword'],
});

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterScreen() {
  const theme = useTheme();

  const { control, handleSubmit, formState: { errors } } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      acceptTerms: false,
    },
  });

  // Web ile aynı endpoint: POST /auth/register
  const registerMutation = useMutation({
    mutationFn: (data: RegisterForm) => authApi.register({
      displayName: data.displayName,
      email: data.email,
      password: data.password,
    }),
    onSuccess: () => {
      router.replace('/(auth)/login');
    },
  });

  const onSubmit = (data: RegisterForm) => {
    registerMutation.mutate(data);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
        <Text variant="displaySmall" style={{ textAlign: 'center', marginBottom: 8, color: theme.colors.primary }}>
          Kayıt Ol
        </Text>
        <Text variant="bodyLarge" style={{ textAlign: 'center', marginBottom: 32, color: theme.colors.outline }}>
          Koleksiyonculara katılın
        </Text>

        <Controller
          control={control}
          name="displayName"
          render={({ field: { onChange, value } }) => (
            <TextInput
              label="Adınız"
              value={value}
              onChangeText={onChange}
              error={!!errors.displayName}
              style={{ marginBottom: 8 }}
            />
          )}
        />
        {errors.displayName && (
          <Text variant="bodySmall" style={{ color: theme.colors.error, marginBottom: 8 }}>
            {errors.displayName.message}
          </Text>
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
              secureTextEntry
              error={!!errors.password}
              style={{ marginBottom: 8 }}
            />
          )}
        />
        {errors.password && (
          <Text variant="bodySmall" style={{ color: theme.colors.error, marginBottom: 8 }}>
            {errors.password.message}
          </Text>
        )}

        <Controller
          control={control}
          name="confirmPassword"
          render={({ field: { onChange, value } }) => (
            <TextInput
              label="Şifre Tekrar"
              value={value}
              onChangeText={onChange}
              secureTextEntry
              error={!!errors.confirmPassword}
              style={{ marginBottom: 8 }}
            />
          )}
        />
        {errors.confirmPassword && (
          <Text variant="bodySmall" style={{ color: theme.colors.error, marginBottom: 16 }}>
            {errors.confirmPassword.message}
          </Text>
        )}

        <Controller
          control={control}
          name="acceptTerms"
          render={({ field: { onChange, value } }) => (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Checkbox status={value ? 'checked' : 'unchecked'} onPress={() => onChange(!value)} />
              <Text variant="bodyMedium" style={{ flex: 1 }}>
                Kullanım koşullarını ve gizlilik politikasını kabul ediyorum
              </Text>
            </View>
          )}
        />
        {errors.acceptTerms && (
          <Text variant="bodySmall" style={{ color: theme.colors.error, marginBottom: 16 }}>
            {errors.acceptTerms.message}
          </Text>
        )}

        {registerMutation.isError && (
          <Text variant="bodySmall" style={{ color: theme.colors.error, marginBottom: 16, textAlign: 'center' }}>
            Kayıt başarısız. Lütfen tekrar deneyin.
          </Text>
        )}

        <Button
          mode="contained"
          onPress={handleSubmit(onSubmit)}
          loading={registerMutation.isPending}
          disabled={registerMutation.isPending}
          style={{ marginBottom: 16 }}
        >
          Kayıt Ol
        </Button>

        <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
          <Text variant="bodyMedium">Zaten hesabınız var mı? </Text>
          <Button mode="text" compact onPress={() => router.push('/(auth)/login')}>
            Giriş Yap
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

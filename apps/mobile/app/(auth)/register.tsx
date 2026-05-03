import { View, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native';
import { Text, TextInput, Button, Checkbox, useTheme } from 'react-native-paper';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { authApi } from '../../src/services/api';
import { useTranslation } from '../../src/i18n';

const registerSchema = z.object({
  displayName: z.string().min(2, 'İsim en az 2 karakter olmalı'),
  email: z.string().email('Geçerli email girin'),
  phone: z.string().optional(),
  password: z.string().min(8, 'Şifre en az 8 karakter olmalı'),
  confirmPassword: z.string(),
  acceptTerms: z.boolean().refine(val => val, 'Kullanım koşullarını kabul etmelisiniz'),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Şifreler eşleşmiyor',
  path: ['confirmPassword'],
});

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterScreen() {
  const theme = useTheme();
  const { t } = useTranslation();

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
      phone: data.phone ? `+90${data.phone.replace(/\D/g, '').replace(/^90/, '')}` : undefined,
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
        <TouchableOpacity
          onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
          style={{ position: 'absolute', top: 16, left: 0, zIndex: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' }}
        >
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>

        <Text variant="displaySmall" style={{ textAlign: 'center', marginBottom: 8, color: theme.colors.primary }}>
          {t('common.register')}
        </Text>
        <Text variant="bodyLarge" style={{ textAlign: 'center', marginBottom: 32, color: theme.colors.outline }}>
          {t('mobile.registerSubtitle')}
        </Text>

        <Controller
          control={control}
          name="displayName"
          render={({ field: { onChange, value } }) => (
            <TextInput
              testID="register-display-name-input"
              label={t('mobile.displayNameLabel')}
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
              testID="register-email-input"
              label={t('auth.email')}
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
          name="phone"
          render={({ field: { onChange, value } }) => (
            <TextInput
              label={t('mobile.phoneOptional')}
              value={value}
              onChangeText={onChange}
              keyboardType="phone-pad"
              left={<TextInput.Affix text="+90" />}
              style={{ marginBottom: 8 }}
            />
          )}
        />

        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, value } }) => (
            <TextInput
              testID="register-password-input"
              label={t('auth.password')}
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
              testID="register-confirm-password-input"
              label={t('mobile.passwordRepeat')}
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
                {t('mobile.acceptTerms')}
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
          <Text testID="register-error-banner" variant="bodySmall" style={{ color: theme.colors.error, marginBottom: 16, textAlign: 'center' }}>
            {t('mobile.registerFailed')}
          </Text>
        )}

        <Button
          testID="register-submit-button"
          mode="contained"
          onPress={handleSubmit(onSubmit)}
          loading={registerMutation.isPending}
          disabled={registerMutation.isPending}
          style={{ marginBottom: 16 }}
        >
          {t('common.register')}
        </Button>

        <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
          <Text variant="bodyMedium">{t('mobile.haveAccount')}</Text>
          <Button mode="text" compact onPress={() => router.push('/(auth)/login')}>
            {t('common.login')}
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  Button,
  Checkbox,
  HStack,
  Input,
  Screen,
  Text,
  VStack,
} from '@tarodan/ui-native';
import { authApi } from '../../src/services/api';
import {
  displayNameSchema,
  emailSchema,
  strongPasswordSchema,
} from '../../src/utils/validation';

const registerSchema = z
  .object({
    displayName: displayNameSchema,
    email: emailSchema,
    password: strongPasswordSchema,
    confirmPassword: z.string(),
    acceptTerms: z
      .boolean()
      .refine((val) => val, 'Kullanım koşullarını kabul etmelisiniz'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Şifreler eşleşmiyor',
    path: ['confirmPassword'],
  });

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterScreen() {
  const { control, handleSubmit, formState: { errors } } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { acceptTerms: false },
  });

  const registerMutation = useMutation({
    mutationFn: (data: RegisterForm) =>
      authApi.register({
        displayName: data.displayName,
        email: data.email,
        password: data.password,
      }),
    onSuccess: () => router.replace('/(auth)/login'),
  });

  const onSubmit = (data: RegisterForm) => registerMutation.mutate(data);

  return (
    <Screen center>
      <VStack gap={3}>
        <Text variant="displaySm" tone="primary" align="center">
          Kayıt Ol
        </Text>
        <Text variant="body" tone="muted" align="center">
          Koleksiyonculara katılın
        </Text>

        <Controller
          control={control}
          name="displayName"
          render={({ field: { onChange, value } }) => (
            <Input
              testID="register-displayName-input"
              label="Adınız"
              value={value}
              onChangeText={onChange}
              error={errors.displayName?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, value } }) => (
            <Input
              testID="register-email-input"
              label="E-posta"
              value={value}
              onChangeText={onChange}
              keyboardType="email-address"
              autoCapitalize="none"
              error={errors.email?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, value } }) => (
            <Input
              testID="register-password-input"
              label="Şifre"
              value={value}
              onChangeText={onChange}
              secureTextEntry
              togglePasswordVisibility
              error={errors.password?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="confirmPassword"
          render={({ field: { onChange, value } }) => (
            <Input
              label="Şifre Tekrar"
              value={value}
              onChangeText={onChange}
              secureTextEntry
              togglePasswordVisibility
              error={errors.confirmPassword?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="acceptTerms"
          render={({ field: { onChange, value } }) => (
            <Checkbox
              checked={value}
              onChange={() => onChange(!value)}
              label="Kullanım koşullarını ve gizlilik politikasını kabul ediyorum"
              error={errors.acceptTerms?.message}
            />
          )}
        />
        {errors.acceptTerms?.message ? (
          <Text variant="bodySm" tone="danger">
            {errors.acceptTerms.message}
          </Text>
        ) : null}

        {registerMutation.isError ? (
          <Text variant="bodySm" tone="danger" align="center">
            Kayıt başarısız. Lütfen tekrar deneyin.
          </Text>
        ) : null}

        <Button
          testID="register-submit-button"
          variant="primary"
          size="lg"
          fullWidth
          title="Kayıt Ol"
          onPress={handleSubmit(onSubmit)}
          isLoading={registerMutation.isPending}
          disabled={registerMutation.isPending}
        />

        <HStack justify="center" wrap gap={1}>
          <Text variant="body">Zaten hesabınız var mı?</Text>
          <Text
            variant="body"
            tone="primary"
            weight="semibold"
            onPress={() => router.push('/(auth)/login')}
          >
            Giriş Yap
          </Text>
        </HStack>
      </VStack>
    </Screen>
  );
}

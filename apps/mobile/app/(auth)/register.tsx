import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  Button,
  Checkbox,
  DateField,
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

/** 18+ yaş kontrolü — API RegisterDto birthDate'i zorunlu kılar (IsAdultConstraint). */
function isAdult(dateStr: string): boolean {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const monthDiff = today.getMonth() - d.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d.getDate())) age -= 1;
  return age >= 18;
}

/** En geç seçilebilir doğum tarihi (bugün - 18 yıl) — 18+'ı seçici seviyesinde kısıtlar. */
function maxBirthDate(): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 18);
  return d;
}

const registerSchema = z
  .object({
    displayName: displayNameSchema,
    email: emailSchema,
    birthDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Lütfen doğum tarihinizi seçin')
      .refine(isAdult, 'Kayıt için en az 18 yaşında olmalısınız'),
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
        birthDate: data.birthDate,
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
          name="birthDate"
          render={({ field: { onChange, value } }) => (
            <DateField
              testID="register-birthDate-input"
              label="Doğum Tarihi"
              value={value}
              onChange={onChange}
              placeholder="Tarih seçin"
              maximumDate={maxBirthDate()}
              error={errors.birthDate?.message}
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
        <Text variant="bodySm" tone="muted">
          Şifre en az 8 karakter olmalı; 1 büyük harf, 1 küçük harf ve 1 rakam içermeli.
        </Text>

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

        <HStack justify="center" wrap gap={1}>
          <Text
            variant="bodySm"
            tone="primary"
            weight="semibold"
            onPress={() => router.push('/terms')}
          >
            Kullanım Koşulları
          </Text>
          <Text variant="bodySm" tone="muted">ve</Text>
          <Text
            variant="bodySm"
            tone="primary"
            weight="semibold"
            onPress={() => router.push('/privacy')}
          >
            Gizlilik Politikası
          </Text>
        </HStack>

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

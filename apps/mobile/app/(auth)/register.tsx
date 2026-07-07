import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Button,
  Checkbox,
  DateField,
  HStack,
  Input,
  Screen,
  Text,
  VStack,
  theme,
} from '@tarodan/ui-native';
import { authApi } from '../../src/services/api';
import {
  displayNameSchema,
  emailSchema,
  strongPasswordSchema,
  isAdult,
} from '../../src/utils/validation';
import { BrandLogo } from '../../src/components/BrandLogo';

const { colors } = theme;

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
    defaultValues: {
      acceptTerms: false,
      // Maestro spinner DateField'ı süremez; test modunda geçerli (18+) bir
      // doğum tarihi öndoldurulur. Prod'da EXPO_PUBLIC_MAESTRO unset → '' .
      birthDate: process.env.EXPO_PUBLIC_MAESTRO === '1' ? '1990-01-01' : '',
    },
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

  const insets = useSafeAreaInsets();
  const handleBack = () =>
    router.canGoBack() ? router.back() : router.replace('/(auth)/login');

  return (
    <Screen center style={styles.screen}>
      <Pressable
        onPress={handleBack}
        accessibilityRole="button"
        accessibilityLabel="Geri"
        hitSlop={12}
        style={[styles.backButton, { top: insets.top + 8 }]}
      >
        <Ionicons name="arrow-back" size={26} color={colors.white} />
      </Pressable>

      <VStack gap={5}>
        {/* Markalı başlık — turuncu zemin üzerinde Tarodan logosu + sayfa başlığı */}
        <View style={styles.brandHeader}>
          <BrandLogo />
          <Text variant="displaySm" align="center" style={styles.headerTitle}>
            Kayıt Ol
          </Text>
        </View>

        {/* Form kartı */}
        <View style={styles.card}>
          <Controller
            control={control}
            name="displayName"
            render={({ field: { onChange, value } }) => (
              <Input
                testID="register-displayName-input"
                label="Adınız"
                leftIconName="person-outline"
                placeholder="Adınız Soyadınız"
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
                leftIconName="lock-closed-outline"
                placeholder="••••••••"
                value={value}
                onChangeText={onChange}
                // Maestro: iOS secureTextEntry'ye yazamıyor + "Automatic Strong Password"
                // kaplaması çıkıyor. Test modunda maskeyi kapat (login.tsx ile aynı). Prod: maskeli.
                secureTextEntry={process.env.EXPO_PUBLIC_MAESTRO !== '1'}
                // Maskesizken iOS otomatik öneri fazladan karakter ekliyor (şifre eşleşmez).
                autoCorrect={false}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                togglePasswordVisibility
                error={errors.password?.message}
              />
            )}
          />
          <Text variant="bodySm" tone="muted" style={{ marginTop: -4, marginBottom: 8 }}>
            Şifre en az 8 karakter olmalı; 1 büyük harf, 1 küçük harf ve 1 rakam içermeli.
          </Text>

          <Controller
            control={control}
            name="confirmPassword"
            render={({ field: { onChange, value } }) => (
              <Input
                testID="register-confirmPassword-input"
                label="Şifre Tekrar"
                leftIconName="lock-closed-outline"
                placeholder="••••••••"
                value={value}
                onChangeText={onChange}
                secureTextEntry={process.env.EXPO_PUBLIC_MAESTRO !== '1'}
                autoCorrect={false}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
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
                testID="register-acceptTerms"
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

          <HStack justify="center" wrap gap={1} style={{ marginTop: 8 }}>
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
            <Text variant="bodySm" tone="danger" align="center" style={{ marginTop: 8 }}>
              {(() => {
                const err = registerMutation.error as any;
                const msg = err?.response?.data?.message;
                const text = Array.isArray(msg) ? msg[0] : msg;
                return text || err?.message || 'Kayıt başarısız. Lütfen tekrar deneyin.';
              })()}
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
            style={{ marginTop: 16 }}
          />
        </View>

        <HStack justify="center" wrap gap={1}>
          <Text variant="body" style={styles.footerText}>Zaten hesabınız var mı?</Text>
          <Text
            variant="body"
            weight="bold"
            style={styles.footerLink}
            onPress={() => router.push('/(auth)/login')}
          >
            Giriş Yap
          </Text>
        </HStack>
      </VStack>
    </Screen>
  );
}

const styles = StyleSheet.create({
  backButton: {
    position: 'absolute',
    left: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  screen: {
    backgroundColor: colors.primary[600]!,
  },
  brandHeader: {
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    color: colors.white,
  },
  footerText: {
    color: colors.primary[50]!,
  },
  footerLink: {
    color: colors.white,
    textDecorationLine: 'underline',
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

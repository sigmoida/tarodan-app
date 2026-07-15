import { View } from 'react-native';
import { Button, Checkbox, DateField, HStack, Input, Text } from '@tarodan/ui-native';
import { Controller } from 'react-hook-form';
import { router } from 'expo-router';
import { styles } from '../_lib/styles';
import { maxBirthDate } from '../_lib/schema';
import type { RegisterController } from '../_hooks/useRegister';

/** Kayıt form kartı — ad/e-posta/doğum/şifre/onay alanları + sözleşme linkleri + gönder. */
export function RegisterForm({ f }: { f: RegisterController }) {
  const { control, errors, registerMutation } = f;

  return (
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
        <Text variant="bodySm" tone="danger">{errors.acceptTerms.message}</Text>
      ) : null}

      <HStack justify="center" wrap gap={1} style={{ marginTop: 8 }}>
        <Text variant="bodySm" tone="primary" weight="semibold" onPress={() => router.push('/terms')}>
          Kullanım Koşulları
        </Text>
        <Text variant="bodySm" tone="muted">ve</Text>
        <Text variant="bodySm" tone="primary" weight="semibold" onPress={() => router.push('/privacy')}>
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
        onPress={f.handleSubmit(f.onSubmit)}
        isLoading={registerMutation.isPending}
        disabled={registerMutation.isPending}
        style={{ marginTop: 16 }}
      />
    </View>
  );
}

import { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useMutation } from '@tanstack/react-query';
import {
  Button,
  Checkbox,
  HStack,
  Input,
  Screen,
  ScreenHeader,
  Text,
  VStack,
  theme,
  appAlert,
} from '@tarodan/ui-native';
import { authApi } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';
import { PhoneInput } from '../../src/components/common';
import { DEFAULT_COUNTRY_CODE, normalizePhoneForPayload } from '../../src/utils/phone';

const { colors, spacing, radius } = theme;

interface BusinessForm {
  companyName: string;
  taxId: string;
  city: string;
  district: string;
  companyType: string;
  email: string;
  phone: string;
  phoneCountryCode: string;
  password: string;
  passwordConfirm: string;
}

export default function RegisterBusinessScreen() {
  const { login } = useAuthStore();
  const [form, setForm] = useState<BusinessForm>({
    companyName: '',
    taxId: '',
    city: '',
    district: '',
    companyType: '',
    email: '',
    phone: '',
    phoneCountryCode: DEFAULT_COUNTRY_CODE,
    password: '',
    passwordConfirm: '',
  });
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptMarketing, setAcceptMarketing] = useState(false);

  const setField = <K extends keyof BusinessForm>(key: K, value: BusinessForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const registerMutation = useMutation({
    mutationFn: async () => {
      const formattedPhone = normalizePhoneForPayload(form.phone, form.phoneCountryCode);
      return authApi.registerBusiness({
        companyName: form.companyName.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        phone: formattedPhone,
        taxId: form.taxId.trim(),
        city: form.city.trim(),
        district: form.district.trim() || undefined,
        companyType: form.companyType.trim() || undefined,
        acceptsMarketingEmails: acceptMarketing,
      });
    },
    onSuccess: async (response) => {
      const data =
        (response.data as { data?: Record<string, unknown> })?.data ??
        ((response.data as Record<string, unknown>) ?? {});
      const tokens = data.tokens as
        | { accessToken?: string; refreshToken?: string }
        | undefined;
      const accessToken = (tokens?.accessToken ?? data.accessToken ?? data.token) as
        | string
        | undefined;
      const refreshToken = (tokens?.refreshToken ?? data.refreshToken) as string | undefined;
      if (accessToken) {
        await SecureStore.setItemAsync('accessToken', accessToken);
        if (refreshToken) await SecureStore.setItemAsync('refreshToken', refreshToken);
      }
      if (data.user && login) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await login(accessToken!, data.user as any);
      }
      appAlert(
        'Kurumsal hesap oluşturuldu',
        'E-posta doğrulaması için kayıtlı e-posta adresinize gönderilen bağlantıyı kullanın.',
        [{ text: 'Devam', onPress: () => router.replace('/seller/dashboard') }],
      );
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      appAlert('Hata', err?.response?.data?.message || 'Kayıt tamamlanamadı.');
    },
  });

  const handleSubmit = () => {
    if (!form.companyName.trim()) return appAlert('Eksik', 'Şirket adı gerekli.');
    if (!/^\d{10,11}$/.test(form.taxId.trim()))
      return appAlert('Eksik', 'Vergi / T.C. no 10 veya 11 hane olmalı.');
    if (form.city.trim().length < 2) return appAlert('Eksik', 'Şehir/İl gerekli.');
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return appAlert('Eksik', 'Geçerli e-posta girin.');
    // TR için tam 10 hane; diğer ülke kodlarında en az 8 hane yeterli.
    const phoneDigits = form.phone.replace(/\D/g, '');
    const phoneValid =
      form.phoneCountryCode === DEFAULT_COUNTRY_CODE
        ? /^[0-9]{10}$/.test(phoneDigits)
        : phoneDigits.length >= 8;
    if (!phoneValid)
      return appAlert('Eksik', 'Geçerli bir telefon numarası girin (5XX XXX XX XX).');
    if (form.password.length < 8)
      return appAlert('Şifre Yetersiz', 'Şifre en az 8 karakter olmalı.');
    if (!/[A-Z]/.test(form.password))
      return appAlert('Şifre Yetersiz', 'Şifre en az 1 büyük harf içermeli.');
    if (!/[a-z]/.test(form.password))
      return appAlert('Şifre Yetersiz', 'Şifre en az 1 küçük harf içermeli.');
    if (!/\d/.test(form.password))
      return appAlert('Şifre Yetersiz', 'Şifre en az 1 rakam içermeli.');
    if (form.password !== form.passwordConfirm)
      return appAlert('Eksik', 'Şifreler eşleşmiyor.');
    if (!acceptTerms)
      return appAlert(
        'Sözleşme',
        'Üyelik sözleşmesini ve KVKK aydınlatmasını kabul etmelisiniz.',
      );
    registerMutation.mutate();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface.alt }}>
      <ScreenHeader title="Kurumsal Kayıt" onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />

      <Screen bg="alt" padding={4}>
        <VStack gap={3}>
          <View
            style={{
              backgroundColor: colors.primary[50]!,
              padding: spacing[4],
              borderRadius: radius.xl,
              alignItems: 'center',
              gap: spacing[1],
            }}
          >
            <Ionicons name="business" size={24} color={colors.primary[600]!} />
            <Text variant="h3" align="center">
              İşletme olarak kaydol
            </Text>
            <Text variant="bodySm" tone="muted" align="center">
              Vergi ve şirket bilgilerinizle kurumsal satıcı hesabı açın. Avantajlı komisyon
              oranları, sınırsız ilan ve kurumsal rozet otomatik etkinleşir.
            </Text>
          </View>

          <Text variant="label" style={{ marginTop: spacing[2] }}>
            Şirket Bilgileri
          </Text>
          <Input
            label="Şirket / İşletme Adı *"
            value={form.companyName}
            onChangeText={(v) => setField('companyName', v)}
          />
          <HStack gap={2}>
            <View style={{ flex: 1 }}>
              <Input
                label="Vergi / TC No *"
                value={form.taxId}
                onChangeText={(v) => setField('taxId', v.replace(/[^\d]/g, ''))}
                keyboardType="number-pad"
                maxLength={11}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                label="Firma Türü"
                value={form.companyType}
                onChangeText={(v) => setField('companyType', v)}
              />
            </View>
          </HStack>
          <HStack gap={2}>
            <View style={{ flex: 1 }}>
              <Input
                label="Şehir / İl *"
                value={form.city}
                onChangeText={(v) => setField('city', v)}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                label="İlçe"
                value={form.district}
                onChangeText={(v) => setField('district', v)}
              />
            </View>
          </HStack>

          <Text variant="label" style={{ marginTop: spacing[2] }}>
            Hesap Bilgileri
          </Text>
          <Input
            label="E-posta *"
            value={form.email}
            onChangeText={(v) => setField('email', v)}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <PhoneInput
            label="Telefon *"
            countryCode={form.phoneCountryCode}
            onCountryCodeChange={(code) => setField('phoneCountryCode', code)}
            phone={form.phone}
            onPhoneChange={(v) => setField('phone', v)}
          />
          <Input
            label="Şifre *"
            value={form.password}
            onChangeText={(v) => setField('password', v)}
            secureTextEntry
            togglePasswordVisibility
          />
          <Input
            label="Şifre (Tekrar) *"
            value={form.passwordConfirm}
            onChangeText={(v) => setField('passwordConfirm', v)}
            secureTextEntry
            togglePasswordVisibility
          />

          <Checkbox
            checked={acceptTerms}
            onChange={() => setAcceptTerms(!acceptTerms)}
            label="Üyelik sözleşmesini ve KVKK aydınlatma metnini okudum, kabul ediyorum. *"
          />

          <Checkbox
            checked={acceptMarketing}
            onChange={() => setAcceptMarketing(!acceptMarketing)}
            label="Kampanya ve bilgilendirmeleri e-posta ile almak istiyorum."
          />

          <Button
            variant="primary"
            size="lg"
            fullWidth
            title="Hesap Oluştur"
            onPress={handleSubmit}
            isLoading={registerMutation.isPending}
            disabled={registerMutation.isPending}
            style={{ marginTop: spacing[3] }}
          />

          <HStack justify="center" gap={1} style={{ marginTop: spacing[3] }}>
            <Text variant="bodySm" tone="muted">
              Zaten hesabınız var mı?
            </Text>
            <Text
              variant="bodySm"
              tone="primary"
              weight="bold"
              onPress={() => router.replace('/(auth)/login')}
            >
              Giriş yapın
            </Text>
          </HStack>
        </VStack>
      </Screen>
    </View>
  );
}

import { View } from 'react-native';
import { Button, Checkbox, HStack, Input, Text, VStack, theme } from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';
import { PhoneInput } from '@/components/common';
import { styles } from '../_lib/styles';
import type { RegisterBusinessController } from '../_hooks/useRegisterBusiness';

const { colors, spacing } = theme;

/** Kurumsal kayıt form kartı — şirket + hesap bilgileri + onaylar + gönder. */
export function RegisterBusinessForm({ f }: { f: RegisterBusinessController }) {
  const { form, setField } = f;

  return (
    <View style={styles.card}>
      <VStack gap={3}>
        <View style={styles.infoCard}>
          <Ionicons name="business" size={24} color={colors.primary[600]!} />
          <Text variant="h3" align="center">İşletme olarak kaydol</Text>
          <Text variant="bodySm" tone="muted" align="center">
            Vergi ve şirket bilgilerinizle kurumsal satıcı hesabı açın. Avantajlı komisyon
            oranları, sınırsız ilan ve kurumsal rozet otomatik etkinleşir.
          </Text>
        </View>

        <Text variant="label" style={{ marginTop: spacing[2] }}>Şirket Bilgileri</Text>
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
            <Input label="Firma Türü" value={form.companyType} onChangeText={(v) => setField('companyType', v)} />
          </View>
        </HStack>
        <HStack gap={2}>
          <View style={{ flex: 1 }}>
            <Input label="Şehir / İl *" value={form.city} onChangeText={(v) => setField('city', v)} />
          </View>
          <View style={{ flex: 1 }}>
            <Input label="İlçe" value={form.district} onChangeText={(v) => setField('district', v)} />
          </View>
        </HStack>

        <Text variant="label" style={{ marginTop: spacing[2] }}>Hesap Bilgileri</Text>
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
          checked={f.acceptTerms}
          onChange={() => f.setAcceptTerms(!f.acceptTerms)}
          label="Üyelik sözleşmesini ve KVKK aydınlatma metnini okudum, kabul ediyorum. *"
        />
        <Checkbox
          checked={f.acceptMarketing}
          onChange={() => f.setAcceptMarketing(!f.acceptMarketing)}
          label="Kampanya ve bilgilendirmeleri e-posta ile almak istiyorum."
        />

        <Button
          variant="primary"
          size="lg"
          fullWidth
          title="Hesap Oluştur"
          onPress={f.handleSubmit}
          isLoading={f.registerMutation.isPending}
          disabled={f.registerMutation.isPending}
          style={{ marginTop: spacing[3] }}
        />
      </VStack>
    </View>
  );
}

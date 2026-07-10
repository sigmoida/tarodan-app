import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Button, Text, theme } from '@tarodan/ui-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ScreenHeader, EmptyState } from '@/components/common';
import { useAuthStore } from '@/stores/authStore';

const { colors } = theme;

/**
 * İşletme Hesabı — bilgilendirme ekranı.
 *
 * Web/backend mantığı: işletme hesabı AYRI bir hesaptır (POST /auth/register/business
 * → yeni user create eder). Mevcut bireysel hesap "işletmeye yükseltilmez".
 * Bu ekran kullanıcıyı bilgilendirir ve ayrı kurumsal kayıt akışına yönlendirir.
 */
export default function SellerRegisterScreen() {
  const { isAuthenticated, user } = useAuthStore();

  const handleBack = () =>
    router.canGoBack() ? router.back() : router.replace('/(tabs)');

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="İşletme Hesabı" onBack={handleBack} />
        <EmptyState
          fullscreen
          icon="briefcase-outline"
          title="Kurumsal hesap açmak için kurumsal kayıt formunu kullanın"
          actionLabel="Kurumsal Hesap Aç"
          onAction={() => router.push('/(auth)/register-business')}
        />
      </View>
    );
  }

  const isBusinessAccount = !!(user?.companyName && user?.taxId);
  const isBusinessTier = user?.membershipTier === 'business';

  // Zaten kurumsal hesap: yönlendirme yerine üyelik/yönetim aksiyonu göster.
  if (isBusinessAccount) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="İşletme Hesabı" onBack={handleBack} />
        <ScrollView contentContainerStyle={styles.scrollBody}>
          <View style={styles.infoCard}>
            <Ionicons name="checkmark-circle" size={22} color={colors.success[600]!} />
            <Text style={styles.infoCardText}>
              Hesabınız zaten kurumsal (işletme) hesap olarak tanımlı.
              {isBusinessTier
                ? ' Business üyeliğiniz aktif.'
                : ' Business üyeliğinizi tamamlayarak kurumsal avantajları etkinleştirin.'}
            </Text>
          </View>

          {!isBusinessTier ? (
            <Button
              variant="primary"
              fullWidth
              title="Business Üyeliğe Geç"
              onPress={() => router.replace('/membership')}
              style={styles.submitBtn}
            />
          ) : null}

          <Button variant="ghost" fullWidth title="Geri Dön" onPress={handleBack} />
        </ScrollView>
      </View>
    );
  }

  // Bireysel hesap: işletme olmak için ayrı hesap açması gerektiğini anlat.
  return (
    <View style={styles.container}>
      <ScreenHeader title="İşletme Hesabı" onBack={handleBack} />
      <ScrollView contentContainerStyle={styles.scrollBody}>
        <View style={styles.benefitsCard}>
          <Text style={styles.benefitsTitle}>Kurumsal Satıcı Avantajları</Text>
          <View style={styles.benefitRow}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success[600]!} />
            <Text style={styles.benefitText}>Sınırsız ilan ve daha düşük komisyon oranı</Text>
          </View>
          <View style={styles.benefitRow}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success[600]!} />
            <Text style={styles.benefitText}>Arama sonuçlarında öncelikli gösterim</Text>
          </View>
          <View style={styles.benefitRow}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success[600]!} />
            <Text style={styles.benefitText}>Fatura düzenleme ve toplu yükleme</Text>
          </View>
          <View style={styles.benefitRow}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success[600]!} />
            <Text style={styles.benefitText}>Kurumsal rozet ve istatistik paneli</Text>
          </View>
        </View>

        <View style={styles.noteCard}>
          <MaterialCommunityIcons name="information-outline" size={18} color={colors.info[600]!} />
          <Text style={styles.noteText}>
            İşletme hesabı, bireysel hesabınızdan ayrı bir hesaptır. Mevcut hesabınız işletmeye
            dönüştürülmez; vergi ve şirket bilgilerinizle ayrı bir kurumsal hesap açmanız gerekir.
          </Text>
        </View>

        <Button
          variant="primary"
          fullWidth
          title="Kurumsal Hesap Aç"
          onPress={() => router.push('/(auth)/register-business')}
          style={styles.submitBtn}
        />

        <Button variant="ghost" fullWidth title="Vazgeç" onPress={handleBack} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  scrollBody: {
    padding: 16,
    gap: 12,
    paddingBottom: 40,
  },
  infoCard: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: colors.success[50]!,
    padding: 12,
    borderRadius: 10,
  },
  infoCardText: {
    flex: 1,
    fontSize: 13,
    color: colors.success[600]!,
  },
  benefitsCard: {
    backgroundColor: colors.primary[50]!,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  benefitsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary[600]!,
    marginBottom: 4,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  benefitText: {
    flex: 1,
    fontSize: 13,
    color: colors.text.heading,
  },
  noteCard: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: colors.info[50]!,
    padding: 12,
    borderRadius: 10,
  },
  noteText: {
    flex: 1,
    fontSize: 12,
    color: colors.info[600]!,
    lineHeight: 17,
  },
  submitBtn: {
    borderRadius: 10,
    marginTop: 8,
  },
});

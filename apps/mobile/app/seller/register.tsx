import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Button, Input, Text, theme } from '@tarodan/ui-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { userApi } from '../../src/services/api';
import { ScreenHeader, EmptyState } from '../../src/components/common';
import { useAuthStore } from '../../src/stores/authStore';

const { colors } = theme;

export default function SellerRegisterScreen() {
  const { isAuthenticated, user, refreshUserData } = useAuthStore();

  const [companyName, setCompanyName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [taxOffice, setTaxOffice] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');

  const upgradeMutation = useMutation({
    mutationFn: async () => {
      return userApi.updateProfile({
        companyName: companyName.trim(),
        taxId: taxId.trim(),
        taxOffice: taxOffice.trim(),
        phone: companyPhone.trim() || undefined,
        sellerType: 'corporate',
      } as any);
    },
    onSuccess: async () => {
      if (refreshUserData) await refreshUserData();
      Alert.alert(
        'Başarılı',
        'İşletme bilgileriniz kaydedildi. Kurumsal üyelik avantajlarına yakında erişeceksiniz.',
        [{ text: 'Tamam', onPress: () => router.replace('/seller/dashboard') }],
      );
    },
    onError: (e: any) =>
      Alert.alert('Hata', e?.response?.data?.message || 'İşlem tamamlanamadı.'),
  });

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title="İşletme Hesabı" />
        <EmptyState
          fullscreen
          icon="briefcase-outline"
          title="İşletme hesabı için önce giriş yapın"
          actionLabel="Giriş Yap"
          onAction={() => router.push('/(auth)/login')}
        />
      </SafeAreaView>
    );
  }

  const isBusiness = user?.membershipTier === 'business';

  const handleSubmit = () => {
    if (!companyName.trim()) return Alert.alert('Eksik', 'Şirket adı gerekli.');
    if (!/^\d{10,11}$/.test(taxId.trim()))
      return Alert.alert('Eksik', 'Geçerli bir vergi / TC kimlik numarası girin (10 veya 11 hane).');
    upgradeMutation.mutate();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="İşletme Hesabı" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
      >
        <ScrollView contentContainerStyle={styles.scrollBody}>
          {isBusiness ? (
            <View style={styles.infoCard}>
              <Ionicons name="checkmark-circle" size={22} color={colors.success[600]!} />
              <Text style={styles.infoCardText}>
                Hesabınız zaten kurumsal (Business) üyelik olarak işaretli. Bilgilerinizi burada güncelleyebilirsiniz.
              </Text>
            </View>
          ) : null}

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

          <Text style={styles.sectionTitle}>Şirket Bilgileri</Text>

          <Input
            label="Şirket / İşletme Adı *"
            value={companyName}
            onChangeText={setCompanyName}
            containerStyle={styles.input}
            leftIconName="business-outline"
          />
          <Input
            label="Vergi No / T.C. Kimlik *"
            value={taxId}
            onChangeText={(v: string) => setTaxId(v.replace(/[^\d]/g, ''))}
            keyboardType="number-pad"
            maxLength={11}
            containerStyle={styles.input}
            leftIconName="card-outline"
          />
          <Input
            label="Vergi Dairesi"
            value={taxOffice}
            onChangeText={setTaxOffice}
            containerStyle={styles.input}
            leftIconName="business-outline"
          />
          <Input
            label="İşletme Telefonu"
            value={companyPhone}
            onChangeText={setCompanyPhone}
            keyboardType="phone-pad"
            placeholder="+90 5XX XXX XX XX"
            containerStyle={styles.input}
            leftIconName="call-outline"
          />

          <View style={styles.noteCard}>
            <MaterialCommunityIcons name="shield-check-outline" size={18} color={colors.info[600]!} />
            <Text style={styles.noteText}>
              Vergi ve şirket bilgilerin resmi belgelerle doğrulanacak. Hatalı veya yanıltıcı bilgi, hesabın askıya alınmasına yol açabilir.
            </Text>
          </View>

          <Button
            variant="primary"
            title="Bilgileri Kaydet"
            onPress={handleSubmit}
            isLoading={upgradeMutation.isPending}
            disabled={upgradeMutation.isPending}
            style={styles.submitBtn}
          />

          <Button
            variant="ghost"
            title="Vazgeç"
            onPress={() => router.back()}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.heading,
    marginTop: 6,
  },
  input: {
    backgroundColor: colors.surface.DEFAULT,
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

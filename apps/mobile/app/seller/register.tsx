import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Button } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { userApi } from '../../src/services/api';
import { TarodanColors } from '../../src/theme';
import { ScreenHeader, EmptyState, Text, TextInput } from '../../src/components/common';
import { useAuthStore } from '../../src/stores/authStore';

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
              <Ionicons name="checkmark-circle" size={22} color={TarodanColors.success} />
              <Text style={styles.infoCardText}>
                Hesabınız zaten kurumsal (Business) üyelik olarak işaretli. Bilgilerinizi burada güncelleyebilirsiniz.
              </Text>
            </View>
          ) : null}

          <View style={styles.benefitsCard}>
            <Text style={styles.benefitsTitle}>Kurumsal Satıcı Avantajları</Text>
            <View style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={18} color={TarodanColors.success} />
              <Text style={styles.benefitText}>Sınırsız ilan ve daha düşük komisyon oranı</Text>
            </View>
            <View style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={18} color={TarodanColors.success} />
              <Text style={styles.benefitText}>Arama sonuçlarında öncelikli gösterim</Text>
            </View>
            <View style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={18} color={TarodanColors.success} />
              <Text style={styles.benefitText}>Fatura düzenleme ve toplu yükleme</Text>
            </View>
            <View style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={18} color={TarodanColors.success} />
              <Text style={styles.benefitText}>Kurumsal rozet ve istatistik paneli</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Şirket Bilgileri</Text>

          <TextInput
            mode="outlined"
            label="Şirket / İşletme Adı *"
            value={companyName}
            onChangeText={setCompanyName}
            style={styles.input}
            outlineColor={TarodanColors.border}
            activeOutlineColor={TarodanColors.primary}
            left={<TextInput.Icon icon="domain" color={TarodanColors.textSecondary} />}
          />
          <TextInput
            mode="outlined"
            label="Vergi No / T.C. Kimlik *"
            value={taxId}
            onChangeText={(v: string) => setTaxId(v.replace(/[^\d]/g, ''))}
            keyboardType="number-pad"
            maxLength={11}
            style={styles.input}
            outlineColor={TarodanColors.border}
            activeOutlineColor={TarodanColors.primary}
            left={<TextInput.Icon icon="card-account-details-outline" color={TarodanColors.textSecondary} />}
          />
          <TextInput
            mode="outlined"
            label="Vergi Dairesi"
            value={taxOffice}
            onChangeText={setTaxOffice}
            style={styles.input}
            outlineColor={TarodanColors.border}
            activeOutlineColor={TarodanColors.primary}
            left={<TextInput.Icon icon="office-building" color={TarodanColors.textSecondary} />}
          />
          <TextInput
            mode="outlined"
            label="İşletme Telefonu"
            value={companyPhone}
            onChangeText={setCompanyPhone}
            keyboardType="phone-pad"
            placeholder="+90 5XX XXX XX XX"
            style={styles.input}
            outlineColor={TarodanColors.border}
            activeOutlineColor={TarodanColors.primary}
            left={<TextInput.Icon icon="phone-outline" color={TarodanColors.textSecondary} />}
          />

          <View style={styles.noteCard}>
            <MaterialCommunityIcons name="shield-check-outline" size={18} color={TarodanColors.info} />
            <Text style={styles.noteText}>
              Vergi ve şirket bilgilerin resmi belgelerle doğrulanacak. Hatalı veya yanıltıcı bilgi, hesabın askıya alınmasına yol açabilir.
            </Text>
          </View>

          <Button
            mode="contained"
            buttonColor={TarodanColors.primary}
            onPress={handleSubmit}
            loading={upgradeMutation.isPending}
            disabled={upgradeMutation.isPending}
            style={styles.submitBtn}
            contentStyle={{ paddingVertical: 4 }}
          >
            Bilgileri Kaydet
          </Button>

          <Button
            mode="text"
            textColor={TarodanColors.textSecondary}
            onPress={() => router.back()}
          >
            Vazgeç
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.backgroundSecondary,
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
    backgroundColor: TarodanColors.successLight,
    padding: 12,
    borderRadius: 10,
  },
  infoCardText: {
    flex: 1,
    fontSize: 13,
    color: TarodanColors.success,
  },
  benefitsCard: {
    backgroundColor: TarodanColors.primaryLight,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  benefitsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: TarodanColors.primary,
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
    color: TarodanColors.textPrimary,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: TarodanColors.textPrimary,
    marginTop: 6,
  },
  input: {
    backgroundColor: TarodanColors.background,
  },
  noteCard: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: TarodanColors.infoLight,
    padding: 12,
    borderRadius: 10,
  },
  noteText: {
    flex: 1,
    fontSize: 12,
    color: TarodanColors.info,
    lineHeight: 17,
  },
  submitBtn: {
    borderRadius: 10,
    marginTop: 8,
  },
});

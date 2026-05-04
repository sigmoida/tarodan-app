import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native';
import { Button, Checkbox } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '../../src/services/api';
import { TarodanColors } from '../../src/theme';
import { ScreenHeader, Text, TextInput } from '../../src/components/common';
import { useAuthStore } from '../../src/stores/authStore';

export default function RegisterBusinessScreen() {
  const { login } = useAuthStore();
  const [form, setForm] = useState({
    companyName: '',
    taxId: '',
    taxOffice: '',
    displayName: '',
    email: '',
    phone: '',
    password: '',
    passwordConfirm: '',
  });
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptMarketing, setAcceptMarketing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const registerMutation = useMutation({
    mutationFn: async () => {
      return authApi.registerBusiness({
        displayName: form.displayName.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        phone: form.phone.trim() || undefined,
        acceptsMarketingEmails: acceptMarketing,
        companyName: form.companyName.trim(),
        taxId: form.taxId.trim(),
        taxOffice: form.taxOffice.trim() || undefined,
      });
    },
    onSuccess: async (response) => {
      const data = response.data?.data ?? response.data ?? {};
      const accessToken = data.accessToken ?? data.token;
      const refreshToken = data.refreshToken;
      if (accessToken) {
        await SecureStore.setItemAsync('accessToken', accessToken);
        if (refreshToken) await SecureStore.setItemAsync('refreshToken', refreshToken);
      }
      if (data.user && login) {
        await login(data.user, accessToken);
      }
      Alert.alert(
        'Kurumsal hesap oluşturuldu',
        'E-posta doğrulaması için kayıtlı e-posta adresinize gönderilen bağlantıyı kullanın.',
        [{ text: 'Devam', onPress: () => router.replace('/seller/dashboard') }],
      );
    },
    onError: (e: any) =>
      Alert.alert('Hata', e?.response?.data?.message || 'Kayıt tamamlanamadı.'),
  });

  const handleSubmit = () => {
    if (!form.companyName.trim()) return Alert.alert('Eksik', 'Şirket adı gerekli.');
    if (!/^\d{10,11}$/.test(form.taxId.trim()))
      return Alert.alert('Eksik', 'Vergi / T.C. no 10 veya 11 hane olmalı.');
    if (!form.displayName.trim()) return Alert.alert('Eksik', 'Yetkili adı gerekli.');
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return Alert.alert('Eksik', 'Geçerli e-posta girin.');
    // Şifre kuralı web ile birebir: 8+ karakter, 1 büyük + 1 küçük + 1 rakam.
    if (form.password.length < 8)
      return Alert.alert('Şifre Yetersiz', 'Şifre en az 8 karakter olmalı.');
    if (!/[A-Z]/.test(form.password))
      return Alert.alert('Şifre Yetersiz', 'Şifre en az 1 büyük harf içermeli.');
    if (!/[a-z]/.test(form.password))
      return Alert.alert('Şifre Yetersiz', 'Şifre en az 1 küçük harf içermeli.');
    if (!/\d/.test(form.password))
      return Alert.alert('Şifre Yetersiz', 'Şifre en az 1 rakam içermeli.');
    if (form.password !== form.passwordConfirm) return Alert.alert('Eksik', 'Şifreler eşleşmiyor.');
    if (!acceptTerms) return Alert.alert('Sözleşme', 'Üyelik sözleşmesini ve KVKK aydınlatmasını kabul etmelisiniz.');
    registerMutation.mutate();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Kurumsal Kayıt" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
      >
        <ScrollView contentContainerStyle={styles.scrollBody}>
          <View style={styles.headerInfo}>
            <Ionicons name="business" size={24} color={TarodanColors.primary} />
            <Text style={styles.headerTitle}>İşletme olarak kaydol</Text>
            <Text style={styles.headerSubtitle}>
              Vergi ve şirket bilgilerinizle kurumsal satıcı hesabı açın. Avantajlı komisyon oranları, sınırsız ilan ve kurumsal rozet otomatik etkinleşir.
            </Text>
          </View>

          <Text style={styles.section}>Şirket Bilgileri</Text>
          <TextInput
            mode="outlined"
            label="Şirket / İşletme Adı *"
            value={form.companyName}
            onChangeText={(v: string) => setForm(f => ({ ...f,companyName: v }))}
            style={styles.input}
            outlineColor={TarodanColors.border}
            activeOutlineColor={TarodanColors.primary}
          />
          <View style={styles.row}>
            <TextInput
              mode="outlined"
              label="Vergi / TC No *"
              value={form.taxId}
              onChangeText={(v: string) => setForm(f => ({ ...f,taxId: v.replace(/[^\d]/g, '') }))}
              keyboardType="number-pad"
              maxLength={11}
              style={[styles.input, { flex: 1 }]}
              outlineColor={TarodanColors.border}
              activeOutlineColor={TarodanColors.primary}
            />
            <TextInput
              mode="outlined"
              label="Vergi Dairesi"
              value={form.taxOffice}
              onChangeText={(v: string) => setForm(f => ({ ...f,taxOffice: v }))}
              style={[styles.input, { flex: 1 }]}
              outlineColor={TarodanColors.border}
              activeOutlineColor={TarodanColors.primary}
            />
          </View>

          <Text style={styles.section}>Yetkili / Hesap Bilgileri</Text>
          <TextInput
            mode="outlined"
            label="Yetkili Adı *"
            value={form.displayName}
            onChangeText={(v: string) => setForm(f => ({ ...f,displayName: v }))}
            style={styles.input}
            outlineColor={TarodanColors.border}
            activeOutlineColor={TarodanColors.primary}
          />
          <TextInput
            mode="outlined"
            label="E-posta *"
            value={form.email}
            onChangeText={(v: string) => setForm(f => ({ ...f,email: v }))}
            keyboardType="email-address"
            autoCapitalize="none"
            style={styles.input}
            outlineColor={TarodanColors.border}
            activeOutlineColor={TarodanColors.primary}
          />
          <TextInput
            mode="outlined"
            label="Telefon"
            placeholder="+90 5XX XXX XX XX"
            value={form.phone}
            onChangeText={(v: string) => setForm(f => ({ ...f,phone: v }))}
            keyboardType="phone-pad"
            style={styles.input}
            outlineColor={TarodanColors.border}
            activeOutlineColor={TarodanColors.primary}
          />
          <TextInput
            mode="outlined"
            label="Şifre *"
            value={form.password}
            onChangeText={(v: string) => setForm(f => ({ ...f,password: v }))}
            secureTextEntry={!showPassword}
            right={
              <TextInput.Icon
                icon={showPassword ? 'eye-off' : 'eye'}
                onPress={() => setShowPassword(s => !s)}
                color={TarodanColors.textSecondary}
              />
            }
            style={styles.input}
            outlineColor={TarodanColors.border}
            activeOutlineColor={TarodanColors.primary}
          />
          <TextInput
            mode="outlined"
            label="Şifre (Tekrar) *"
            value={form.passwordConfirm}
            onChangeText={(v: string) => setForm(f => ({ ...f,passwordConfirm: v }))}
            secureTextEntry={!showPassword}
            style={styles.input}
            outlineColor={TarodanColors.border}
            activeOutlineColor={TarodanColors.primary}
          />

          <TouchableOpacity
            style={styles.checkRow}
            onPress={() => setAcceptTerms(!acceptTerms)}
          >
            <Checkbox.Android
              status={acceptTerms ? 'checked' : 'unchecked'}
              onPress={() => setAcceptTerms(!acceptTerms)}
              color={TarodanColors.primary}
            />
            <Text style={styles.checkText}>
              Üyelik sözleşmesini ve KVKK aydınlatma metnini okudum, kabul ediyorum. *
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.checkRow}
            onPress={() => setAcceptMarketing(!acceptMarketing)}
          >
            <Checkbox.Android
              status={acceptMarketing ? 'checked' : 'unchecked'}
              onPress={() => setAcceptMarketing(!acceptMarketing)}
              color={TarodanColors.primary}
            />
            <Text style={styles.checkText}>
              Kampanya ve bilgilendirmeleri e-posta ile almak istiyorum.
            </Text>
          </TouchableOpacity>

          <Button
            mode="contained"
            buttonColor={TarodanColors.primary}
            onPress={handleSubmit}
            loading={registerMutation.isPending}
            disabled={registerMutation.isPending}
            style={styles.submitBtn}
            contentStyle={{ paddingVertical: 4 }}
          >
            Hesap Oluştur
          </Button>

          <TouchableOpacity onPress={() => router.replace('/(auth)/login')}>
            <Text style={styles.loginLink}>
              Zaten hesabınız var mı? <Text style={{ color: TarodanColors.primary, fontWeight: '700' }}>Giriş yapın</Text>
            </Text>
          </TouchableOpacity>
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
    gap: 10,
    paddingBottom: 40,
  },
  headerInfo: {
    alignItems: 'center',
    padding: 16,
    gap: 6,
    backgroundColor: TarodanColors.primaryLight,
    borderRadius: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: TarodanColors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  section: {
    fontSize: 14,
    fontWeight: '700',
    color: TarodanColors.textPrimary,
    marginTop: 10,
    marginBottom: 4,
  },
  input: {
    backgroundColor: TarodanColors.background,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  checkText: {
    flex: 1,
    fontSize: 12,
    color: TarodanColors.textSecondary,
    lineHeight: 17,
  },
  submitBtn: {
    borderRadius: 10,
    marginTop: 10,
  },
  loginLink: {
    textAlign: 'center',
    marginTop: 16,
    fontSize: 13,
    color: TarodanColors.textSecondary,
  },
});

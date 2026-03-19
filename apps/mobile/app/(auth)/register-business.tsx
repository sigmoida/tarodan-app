import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TarodanColors } from '../../src/theme/colors';
import { useAuthStore } from '../../src/stores/authStore';
import { api } from '../../src/services/api';

export default function RegisterBusinessScreen() {
  const { isAuthenticated } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [form, setForm] = useState({
    companyName: '',
    taxNumber: '',
    taxOffice: '',
    tradeRegistryNumber: '',
    iban: '',
    authorizedPerson: '',
    authorizedPersonTitle: '',
    authorizedPhone: '',
    authorizedEmail: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const updateField = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!form.companyName.trim()) newErrors.companyName = 'Firma adı gerekli';
    if (!form.taxNumber.trim()) newErrors.taxNumber = 'Vergi numarası gerekli';
    if (form.taxNumber.trim().length < 10) newErrors.taxNumber = 'Vergi numarası en az 10 haneli olmalı';
    if (!form.taxOffice.trim()) newErrors.taxOffice = 'Vergi dairesi gerekli';
    if (!form.iban.trim()) newErrors.iban = 'IBAN gerekli';
    if (form.iban.trim().length < 26) newErrors.iban = 'Geçerli bir IBAN girin (TR ile başlamalı)';
    if (!form.authorizedPerson.trim()) newErrors.authorizedPerson = 'Yetkili kişi adı gerekli';
    if (!form.authorizedPhone.trim()) newErrors.authorizedPhone = 'Telefon numarası gerekli';
    if (!form.authorizedEmail.trim()) {
      newErrors.authorizedEmail = 'E-posta adresi gerekli';
    } else if (!/\S+@\S+\.\S+/.test(form.authorizedEmail.trim())) {
      newErrors.authorizedEmail = 'Geçerli bir e-posta girin';
    }
    if (!acceptedTerms) newErrors.terms = 'Kurumsal üyelik sözleşmesini kabul etmelisiniz';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setLoading(true);
    try {
      await api.post('/auth/register-business', {
        companyName: form.companyName.trim(),
        taxNumber: form.taxNumber.trim(),
        taxOffice: form.taxOffice.trim(),
        tradeRegistryNumber: form.tradeRegistryNumber.trim() || undefined,
        iban: form.iban.trim(),
        authorizedPerson: form.authorizedPerson.trim(),
        authorizedPersonTitle: form.authorizedPersonTitle.trim() || undefined,
        authorizedPhone: form.authorizedPhone.trim(),
        authorizedEmail: form.authorizedEmail.trim(),
      });
      Alert.alert('Başarılı', 'Kurumsal kayıt başvurunuz alındı. Onay sonrası bilgilendirileceksiniz.', [
        { text: 'Tamam', onPress: () => router.replace('/(tabs)/profile') },
      ]);
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Kayıt sırasında bir hata oluştu';
      Alert.alert('Hata', message);
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centeredContainer}>
          <Ionicons name="business-outline" size={64} color={TarodanColors.primary} />
          <Text style={styles.emptyTitle}>Kurumsal Kayıt</Text>
          <Text style={styles.emptySubtitle}>Kurumsal kayıt için önce giriş yapmalısınız</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/(auth)/login')}>
            <Text style={styles.primaryButtonText}>Giriş Yap</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBackBtn}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Kurumsal Kayıt</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Intro */}
          <View style={styles.introSection}>
            <View style={styles.introIconWrap}>
              <Ionicons name="business" size={40} color={TarodanColors.primary} />
            </View>
            <Text style={styles.introTitle}>Kurumsal Üyelik</Text>
            <Text style={styles.introSubtitle}>
              Firmanız adına kayıt oluşturun ve kurumsal avantajlardan yararlanın
            </Text>
          </View>

          {/* Company Info Section */}
          <View style={styles.sectionDivider}>
            <Ionicons name="briefcase-outline" size={18} color={TarodanColors.primary} />
            <Text style={styles.sectionDividerText}>Firma Bilgileri</Text>
          </View>

          {/* Company Name */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Firma Adı *</Text>
            <View style={[styles.inputWrapper, errors.companyName ? styles.inputError : null]}>
              <Ionicons name="business-outline" size={20} color={TarodanColors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="Firma unvanı"
                placeholderTextColor={TarodanColors.textTertiary}
                value={form.companyName}
                onChangeText={(v) => updateField('companyName', v)}
              />
            </View>
            {errors.companyName && <Text style={styles.errorText}>{errors.companyName}</Text>}
          </View>

          {/* Tax Number */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Vergi Numarası *</Text>
            <View style={[styles.inputWrapper, errors.taxNumber ? styles.inputError : null]}>
              <Ionicons name="document-text-outline" size={20} color={TarodanColors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="Vergi numarası (10-11 haneli)"
                placeholderTextColor={TarodanColors.textTertiary}
                value={form.taxNumber}
                onChangeText={(v) => updateField('taxNumber', v)}
                keyboardType="number-pad"
                maxLength={11}
              />
            </View>
            {errors.taxNumber && <Text style={styles.errorText}>{errors.taxNumber}</Text>}
          </View>

          {/* Tax Office */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Vergi Dairesi *</Text>
            <View style={[styles.inputWrapper, errors.taxOffice ? styles.inputError : null]}>
              <Ionicons name="location-outline" size={20} color={TarodanColors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="Vergi dairesi adı"
                placeholderTextColor={TarodanColors.textTertiary}
                value={form.taxOffice}
                onChangeText={(v) => updateField('taxOffice', v)}
              />
            </View>
            {errors.taxOffice && <Text style={styles.errorText}>{errors.taxOffice}</Text>}
          </View>

          {/* Trade Registry Number */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Ticaret Sicil Numarası</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="reader-outline" size={20} color={TarodanColors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="Ticaret sicil numarası (opsiyonel)"
                placeholderTextColor={TarodanColors.textTertiary}
                value={form.tradeRegistryNumber}
                onChangeText={(v) => updateField('tradeRegistryNumber', v)}
              />
            </View>
          </View>

          {/* IBAN */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>IBAN *</Text>
            <View style={[styles.inputWrapper, errors.iban ? styles.inputError : null]}>
              <Ionicons name="card-outline" size={20} color={TarodanColors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="TR00 0000 0000 0000 0000 0000 00"
                placeholderTextColor={TarodanColors.textTertiary}
                value={form.iban}
                onChangeText={(v) => updateField('iban', v.toUpperCase())}
                autoCapitalize="characters"
                maxLength={32}
              />
            </View>
            {errors.iban && <Text style={styles.errorText}>{errors.iban}</Text>}
          </View>

          {/* Authorized Person Section */}
          <View style={styles.sectionDivider}>
            <Ionicons name="person-outline" size={18} color={TarodanColors.primary} />
            <Text style={styles.sectionDividerText}>Yetkili Kişi Bilgileri</Text>
          </View>

          {/* Authorized Person */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Yetkili Kişi Adı Soyadı *</Text>
            <View style={[styles.inputWrapper, errors.authorizedPerson ? styles.inputError : null]}>
              <Ionicons name="person-outline" size={20} color={TarodanColors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="Ad Soyad"
                placeholderTextColor={TarodanColors.textTertiary}
                value={form.authorizedPerson}
                onChangeText={(v) => updateField('authorizedPerson', v)}
              />
            </View>
            {errors.authorizedPerson && <Text style={styles.errorText}>{errors.authorizedPerson}</Text>}
          </View>

          {/* Title */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Ünvan / Pozisyon</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="ribbon-outline" size={20} color={TarodanColors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="Örn: Şirket Müdürü (opsiyonel)"
                placeholderTextColor={TarodanColors.textTertiary}
                value={form.authorizedPersonTitle}
                onChangeText={(v) => updateField('authorizedPersonTitle', v)}
              />
            </View>
          </View>

          {/* Phone */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Telefon *</Text>
            <View style={[styles.inputWrapper, errors.authorizedPhone ? styles.inputError : null]}>
              <Ionicons name="call-outline" size={20} color={TarodanColors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="05XX XXX XX XX"
                placeholderTextColor={TarodanColors.textTertiary}
                value={form.authorizedPhone}
                onChangeText={(v) => updateField('authorizedPhone', v)}
                keyboardType="phone-pad"
                maxLength={15}
              />
            </View>
            {errors.authorizedPhone && <Text style={styles.errorText}>{errors.authorizedPhone}</Text>}
          </View>

          {/* Email */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>E-posta *</Text>
            <View style={[styles.inputWrapper, errors.authorizedEmail ? styles.inputError : null]}>
              <Ionicons name="mail-outline" size={20} color={TarodanColors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="firma@example.com"
                placeholderTextColor={TarodanColors.textTertiary}
                value={form.authorizedEmail}
                onChangeText={(v) => updateField('authorizedEmail', v)}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
            {errors.authorizedEmail && <Text style={styles.errorText}>{errors.authorizedEmail}</Text>}
          </View>

          {/* Terms */}
          <View style={styles.termsSection}>
            <TouchableOpacity
              style={styles.termsRow}
              onPress={() => setAcceptedTerms(!acceptedTerms)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}>
                {acceptedTerms && <Ionicons name="checkmark" size={16} color={TarodanColors.textOnPrimary} />}
              </View>
              <Text style={styles.termsText}>
                <Text style={styles.termsLink} onPress={() => router.push('/terms')}>Kurumsal Üyelik Sözleşmesi</Text>
                'ni ve{' '}
                <Text style={styles.termsLink} onPress={() => router.push('/privacy')}>Gizlilik Politikası</Text>
                'nı okudum ve kabul ediyorum
              </Text>
            </TouchableOpacity>
            {errors.terms && <Text style={styles.errorText}>{errors.terms}</Text>}
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color={TarodanColors.textOnPrimary} />
            ) : (
              <>
                <Ionicons name="business" size={20} color={TarodanColors.textOnPrimary} />
                <Text style={styles.submitButtonText}>Başvuru Yap</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Info Note */}
          <View style={styles.infoNote}>
            <Ionicons name="information-circle-outline" size={20} color={TarodanColors.info} />
            <Text style={styles.infoNoteText}>
              Başvurunuz incelendikten sonra en geç 2 iş günü içinde onaylanacaktır. Onay bilgisi e-posta ile gönderilecektir.
            </Text>
          </View>

          <View style={{ height: 40 }} />
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
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  header: {
    backgroundColor: TarodanColors.primary,
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerBackBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TarodanColors.textOnPrimary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  introSection: {
    alignItems: 'center',
    marginBottom: 28,
  },
  introIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: TarodanColors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  introTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    marginBottom: 8,
  },
  introSubtitle: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  sectionDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 8,
    gap: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: TarodanColors.border,
  },
  sectionDividerText: {
    fontSize: 15,
    fontWeight: '700',
    color: TarodanColors.textPrimary,
  },
  inputGroup: {
    marginBottom: 18,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TarodanColors.background,
    borderWidth: 1,
    borderColor: TarodanColors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  inputError: {
    borderColor: TarodanColors.error,
  },
  inputIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: TarodanColors.textPrimary,
    paddingVertical: 14,
  },
  errorText: {
    fontSize: 12,
    color: TarodanColors.error,
    marginTop: 4,
  },
  termsSection: {
    marginTop: 8,
    marginBottom: 24,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: TarodanColors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: TarodanColors.primary,
    borderColor: TarodanColors.primary,
  },
  termsText: {
    flex: 1,
    fontSize: 14,
    color: TarodanColors.textSecondary,
    lineHeight: 20,
  },
  termsLink: {
    color: TarodanColors.primary,
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: TarodanColors.primary,
    paddingVertical: 16,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: TarodanColors.textOnPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  infoNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: TarodanColors.infoLight,
    padding: 14,
    borderRadius: 12,
    marginTop: 16,
    gap: 10,
  },
  infoNoteText: {
    flex: 1,
    fontSize: 13,
    color: TarodanColors.textSecondary,
    lineHeight: 18,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: TarodanColors.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  primaryButtonText: {
    color: TarodanColors.textOnPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
});

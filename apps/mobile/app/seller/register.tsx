import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TarodanColors } from '../../src/theme/colors';
import { useAuthStore } from '../../src/stores/authStore';
import { api } from '../../src/services/api';

export default function SellerRegisterScreen() {
  const { isAuthenticated } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [form, setForm] = useState({
    storeName: '',
    description: '',
    returnPolicy: '',
    phone: '',
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
    if (!form.storeName.trim()) newErrors.storeName = 'Mağaza adı gerekli';
    if (form.storeName.trim().length < 3) newErrors.storeName = 'Mağaza adı en az 3 karakter olmalı';
    if (!form.description.trim()) newErrors.description = 'Açıklama gerekli';
    if (!form.phone.trim()) newErrors.phone = 'Telefon numarası gerekli';
    if (form.phone.trim().length < 10) newErrors.phone = 'Geçerli bir telefon numarası girin';
    if (!acceptedTerms) newErrors.terms = 'Satıcı sözleşmesini kabul etmelisiniz';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setLoading(true);
    try {
      await api.post('/seller/register', {
        storeName: form.storeName.trim(),
        description: form.description.trim(),
        returnPolicy: form.returnPolicy.trim(),
        phone: form.phone.trim(),
      });
      Alert.alert('Başarılı', 'Satıcı kaydınız tamamlandı!', [
        { text: 'Tamam', onPress: () => router.replace('/seller/dashboard') },
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
          <Ionicons name="storefront-outline" size={64} color={TarodanColors.primary} />
          <Text style={styles.emptyTitle}>Satıcı Ol</Text>
          <Text style={styles.emptySubtitle}>Satıcı olmak için önce giriş yapmalısınız</Text>
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
        <Text style={styles.headerTitle}>Satıcı Ol</Text>
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
              <Ionicons name="storefront" size={40} color={TarodanColors.primary} />
            </View>
            <Text style={styles.introTitle}>Mağazanızı Açın</Text>
            <Text style={styles.introSubtitle}>
              Koleksiyonlarınızı satışa sunun ve binlerce koleksiyoncuya ulaşın
            </Text>
          </View>

          {/* Store Name */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Mağaza Adı *</Text>
            <View style={[styles.inputWrapper, errors.storeName ? styles.inputError : null]}>
              <Ionicons name="business-outline" size={20} color={TarodanColors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="Mağazanızın adı"
                placeholderTextColor={TarodanColors.textTertiary}
                value={form.storeName}
                onChangeText={(v) => updateField('storeName', v)}
                maxLength={50}
              />
            </View>
            {errors.storeName && <Text style={styles.errorText}>{errors.storeName}</Text>}
          </View>

          {/* Description */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Mağaza Açıklaması *</Text>
            <View style={[styles.inputWrapper, styles.textAreaWrapper, errors.description ? styles.inputError : null]}>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="Mağazanız hakkında kısa bir açıklama yazın"
                placeholderTextColor={TarodanColors.textTertiary}
                value={form.description}
                onChangeText={(v) => updateField('description', v)}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                maxLength={500}
              />
            </View>
            <Text style={styles.charCount}>{form.description.length}/500</Text>
            {errors.description && <Text style={styles.errorText}>{errors.description}</Text>}
          </View>

          {/* Return Policy */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>İade Politikası</Text>
            <View style={[styles.inputWrapper, styles.textAreaWrapper]}>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="İade ve değişim koşullarınızı belirtin (opsiyonel)"
                placeholderTextColor={TarodanColors.textTertiary}
                value={form.returnPolicy}
                onChangeText={(v) => updateField('returnPolicy', v)}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                maxLength={300}
              />
            </View>
          </View>

          {/* Phone */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Telefon Numarası *</Text>
            <View style={[styles.inputWrapper, errors.phone ? styles.inputError : null]}>
              <Ionicons name="call-outline" size={20} color={TarodanColors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="05XX XXX XX XX"
                placeholderTextColor={TarodanColors.textTertiary}
                value={form.phone}
                onChangeText={(v) => updateField('phone', v)}
                keyboardType="phone-pad"
                maxLength={15}
              />
            </View>
            {errors.phone && <Text style={styles.errorText}>{errors.phone}</Text>}
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
                <Text style={styles.termsLink} onPress={() => router.push('/terms')}>Satıcı Sözleşmesi</Text>
                'ni okudum ve kabul ediyorum
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
                <Ionicons name="storefront" size={20} color={TarodanColors.textOnPrimary} />
                <Text style={styles.submitButtonText}>Satıcı Ol</Text>
              </>
            )}
          </TouchableOpacity>

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
  textAreaWrapper: {
    alignItems: 'flex-start',
    paddingVertical: 10,
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
  textArea: {
    minHeight: 80,
    paddingVertical: 0,
  },
  charCount: {
    fontSize: 12,
    color: TarodanColors.textTertiary,
    textAlign: 'right',
    marginTop: 4,
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

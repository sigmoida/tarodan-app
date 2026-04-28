import { useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Text } from 'react-native-paper';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TarodanColors } from '../src/theme';
import { api } from '../src/services/api';

export default function NewsletterScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubscribe = async () => {
    setError('');

    if (!email.trim()) {
      setError('Lütfen e-posta adresinizi girin.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Geçerli bir e-posta adresi girin.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/newsletter/subscribe', { email: email.trim() });
      setSuccess(true);
    } catch (err: any) {
      const message = err?.response?.data?.message;
      setError(message || 'Bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bülten Aboneliği</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.contentContainer}
        >
          <View style={styles.hero}>
            <View style={styles.iconContainer}>
              <Ionicons name="mail-outline" size={48} color={TarodanColors.primary} />
            </View>
            <Text style={styles.heroTitle}>Tarodan Bültenine Katılın</Text>
            <Text style={styles.heroText}>
              Yeni ürünler, özel indirimler, koleksiyon haberleri ve platform güncellemelerinden ilk siz haberdar olun.
            </Text>
          </View>

          <View style={styles.benefitsSection}>
            <Text style={styles.benefitsTitle}>Bülten abonelerine özel:</Text>
            <View style={styles.benefitRow}>
              <Ionicons name="star" size={16} color={TarodanColors.warning} />
              <Text style={styles.benefitText}>Haftalık öne çıkan koleksiyon parçaları</Text>
            </View>
            <View style={styles.benefitRow}>
              <Ionicons name="pricetag" size={16} color={TarodanColors.accent} />
              <Text style={styles.benefitText}>Abonelere özel indirim kodları</Text>
            </View>
            <View style={styles.benefitRow}>
              <Ionicons name="newspaper" size={16} color={TarodanColors.accentBlue} />
              <Text style={styles.benefitText}>Diecast dünyasından güncel haberler</Text>
            </View>
            <View style={styles.benefitRow}>
              <Ionicons name="trophy" size={16} color={TarodanColors.primary} />
              <Text style={styles.benefitText}>Çekiliş ve yarışma duyuruları</Text>
            </View>
          </View>

          {success ? (
            <View style={styles.successCard}>
              <Ionicons name="checkmark-circle" size={48} color={TarodanColors.accent} />
              <Text style={styles.successTitle}>Başarıyla Kaydoldunuz!</Text>
              <Text style={styles.successText}>
                Bülten aboneliğiniz aktif edildi. Onay e-postanızı kontrol edin.
              </Text>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => router.back()}
              >
                <Text style={styles.backButtonText}>Ana Sayfaya Dön</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.formCard}>
              <Text style={styles.formLabel}>E-posta Adresiniz</Text>
              <TextInput
                style={[styles.input, error ? styles.inputError : null]}
                placeholder="ornek@email.com"
                placeholderTextColor={TarodanColors.textTertiary}
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  if (error) setError('');
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                editable={!loading}
              />
              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <TouchableOpacity
                style={[styles.subscribeButton, loading && styles.subscribeButtonDisabled]}
                onPress={handleSubscribe}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color={TarodanColors.textOnPrimary} size="small" />
                ) : (
                  <>
                    <Ionicons name="notifications-outline" size={18} color={TarodanColors.textOnPrimary} />
                    <Text style={styles.subscribeButtonText}>Abone Ol</Text>
                  </>
                )}
              </TouchableOpacity>

              <Text style={styles.disclaimer}>
                Abone olarak Gizlilik Politikamızı kabul etmiş olursunuz. İstediğiniz zaman abonelikten çıkabilirsiniz.
              </Text>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.background,
  },
  header: {
    backgroundColor: TarodanColors.primary,
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TarodanColors.textOnPrimary,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  hero: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: TarodanColors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    textAlign: 'center',
  },
  heroText: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 10,
  },
  benefitsSection: {
    backgroundColor: TarodanColors.backgroundSecondary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  benefitsTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
    marginBottom: 12,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  benefitText: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
    flex: 1,
  },
  formCard: {
    backgroundColor: TarodanColors.backgroundSecondary,
    borderRadius: 12,
    padding: 20,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: TarodanColors.background,
    borderWidth: 1,
    borderColor: TarodanColors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: TarodanColors.textPrimary,
  },
  inputError: {
    borderColor: TarodanColors.error,
  },
  errorText: {
    fontSize: 12,
    color: TarodanColors.error,
    marginTop: 6,
  },
  subscribeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TarodanColors.primary,
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 16,
    gap: 8,
  },
  subscribeButtonDisabled: {
    opacity: 0.7,
  },
  subscribeButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: TarodanColors.textOnPrimary,
  },
  disclaimer: {
    fontSize: 11,
    color: TarodanColors.textTertiary,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 16,
  },
  successCard: {
    alignItems: 'center',
    backgroundColor: TarodanColors.accentLight,
    borderRadius: 12,
    padding: 24,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    marginTop: 12,
  },
  successText: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  backButton: {
    marginTop: 20,
    backgroundColor: TarodanColors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: TarodanColors.textOnPrimary,
  },
});

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TarodanColors } from '../../src/theme/colors';
import { paymentsApi } from '../../src/services/api';

const FAILURE_REASONS = [
  { icon: 'card-outline' as const, text: 'Yetersiz bakiye veya limit aşımı' },
  { icon: 'alert-circle-outline' as const, text: 'Kart bilgileri hatalı girilmiş olabilir' },
  { icon: 'shield-outline' as const, text: '3D Secure doğrulaması başarısız olmuş olabilir' },
  { icon: 'close-circle-outline' as const, text: 'Banka tarafından işlem reddedilmiş olabilir' },
  { icon: 'wifi-outline' as const, text: 'Bağlantı sorunu yaşanmış olabilir' },
];

export default function PaymentFailScreen() {
  const { paymentId } = useLocalSearchParams<{ paymentId?: string }>();
  const [payment, setPayment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [releasing, setReleasing] = useState(false);

  useEffect(() => {
    if (paymentId) {
      fetchPaymentDetails();
    } else {
      setLoading(false);
    }
  }, [paymentId]);

  const fetchPaymentDetails = async () => {
    try {
      const response = await paymentsApi.getStatus(paymentId!);
      const data = response.data?.payment || response.data;
      setPayment(data);

      if (data?.status === 'pending') {
        await releaseReservation();
      }
    } catch (error) {
      console.error('Payment details fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  const releaseReservation = async () => {
    setReleasing(true);
    try {
      await paymentsApi.confirmFailed(paymentId!);
    } catch (error) {
      console.error('Release reservation error:', error);
    } finally {
      setReleasing(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(amount);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={TarodanColors.primary} />
          <Text style={styles.loadingText}>Ödeme bilgileri yükleniyor...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.iconContainer}>
          <View style={styles.errorCircle}>
            <Ionicons name="close" size={56} color="#FFFFFF" />
          </View>
        </View>

        <Text style={styles.title}>Ödeme Başarısız Oldu</Text>
        <Text style={styles.subtitle}>
          Ödemeniz işlenirken bir sorun oluştu. Lütfen aşağıdaki bilgileri kontrol edin.
        </Text>

        {payment?.amount && (
          <View style={styles.detailsCard}>
            <Text style={styles.cardTitle}>Ödeme Bilgileri</Text>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Tutar</Text>
              <Text style={styles.detailValue}>{formatCurrency(payment.amount)}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Durum</Text>
              <View style={styles.statusBadge}>
                <Ionicons name="close-circle" size={16} color={TarodanColors.error} />
                <Text style={styles.statusText}>Başarısız</Text>
              </View>
            </View>

            {releasing && (
              <>
                <View style={styles.divider} />
                <View style={styles.releasingRow}>
                  <ActivityIndicator size="small" color={TarodanColors.warning} />
                  <Text style={styles.releasingText}>Rezervasyon serbest bırakılıyor...</Text>
                </View>
              </>
            )}
          </View>
        )}

        <View style={styles.reasonsCard}>
          <Text style={styles.cardTitle}>Olası Nedenler</Text>
          {FAILURE_REASONS.map((reason, index) => (
            <View key={index} style={styles.reasonRow}>
              <View style={styles.reasonIconWrapper}>
                <Ionicons name={reason.icon} size={18} color={TarodanColors.textSecondary} />
              </View>
              <Text style={styles.reasonText}>{reason.text}</Text>
            </View>
          ))}
        </View>

        <View style={styles.helpBox}>
          <Ionicons name="help-buoy-outline" size={20} color={TarodanColors.primary} />
          <Text style={styles.helpText}>
            Sorun devam ediyorsa{' '}
            <Text style={styles.helpLink} onPress={() => router.push('/support')}>
              destek ekibimizle
            </Text>
            {' '}iletişime geçebilirsiniz.
          </Text>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.replace('/listings')}
            activeOpacity={0.8}
          >
            <Ionicons name="refresh-outline" size={20} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>Tekrar Dene</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.replace('/orders')}
            activeOpacity={0.8}
          >
            <Ionicons name="list-outline" size={20} color={TarodanColors.primary} />
            <Text style={styles.secondaryButtonText}>Siparişlerime Dön</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 15,
    color: TarodanColors.textSecondary,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 48,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  errorCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: TarodanColors.error,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: TarodanColors.error,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: TarodanColors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  detailsCard: {
    backgroundColor: TarodanColors.surfaceVariant,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: TarodanColors.borderLight,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: TarodanColors.textPrimary,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  detailLabel: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: TarodanColors.borderLight,
    marginVertical: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: TarodanColors.errorLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
    color: TarodanColors.error,
  },
  releasingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  releasingText: {
    fontSize: 13,
    color: TarodanColors.warning,
    fontWeight: '500',
  },
  reasonsCard: {
    backgroundColor: TarodanColors.surfaceVariant,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: TarodanColors.borderLight,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  reasonIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: TarodanColors.backgroundTertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reasonText: {
    flex: 1,
    fontSize: 14,
    color: TarodanColors.textSecondary,
    lineHeight: 20,
  },
  helpBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: TarodanColors.primaryLight,
    padding: 16,
    borderRadius: 12,
    marginBottom: 32,
  },
  helpText: {
    flex: 1,
    fontSize: 13,
    color: TarodanColors.textSecondary,
    lineHeight: 19,
  },
  helpLink: {
    color: TarodanColors.primary,
    fontWeight: '600',
  },
  buttonContainer: {
    gap: 12,
    marginBottom: 24,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: TarodanColors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    shadowColor: TarodanColors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: TarodanColors.background,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: TarodanColors.primary,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: TarodanColors.primary,
  },
});

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TarodanColors } from '../../src/theme/colors';
import { paymentsApi } from '../../src/services/api';

type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | string;

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: string }> = {
  pending: {
    label: 'Bekliyor',
    color: TarodanColors.warning,
    bgColor: TarodanColors.warningLight,
    icon: 'time-outline',
  },
  processing: {
    label: 'İşleniyor',
    color: TarodanColors.info,
    bgColor: TarodanColors.infoLight,
    icon: 'sync-outline',
  },
  completed: {
    label: 'Tamamlandı',
    color: TarodanColors.success,
    bgColor: TarodanColors.successLight,
    icon: 'checkmark-circle-outline',
  },
  failed: {
    label: 'Başarısız',
    color: TarodanColors.error,
    bgColor: TarodanColors.errorLight,
    icon: 'close-circle-outline',
  },
  cancelled: {
    label: 'İptal Edildi',
    color: TarodanColors.textSecondary,
    bgColor: TarodanColors.backgroundTertiary,
    icon: 'ban-outline',
  },
};

export default function PaymentDetailScreen() {
  const { id, type: paymentFlowType } = useLocalSearchParams<{ id: string; type?: string }>();
  const [payment, setPayment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      fetchPaymentDetails();
    }
  }, [id]);

  const fetchPaymentDetails = async () => {
    try {
      setError(null);
      const response = await paymentsApi.getStatus(id!);
      const data = response.data?.payment || response.data;
      setPayment(data);

      if (data?.status === 'completed') {
        const isMembershipFlow =
          paymentFlowType === 'membership' ||
          data?.metadata?.type === 'membership' ||
          data?.orderType === 'membership' ||
          data?.isMembershipPayment;
        if (isMembershipFlow) {
          router.replace('/membership/success');
          return;
        }
        router.replace(`/payment/success?paymentId=${id}&orderId=${data.orderId || ''}`);
        return;
      }

      if (data?.status === 'failed' || data?.status === 'cancelled') {
        router.replace(`/payment/fail?paymentId=${id}`);
        return;
      }

    } catch (err) {
      console.error('Payment detail fetch error:', err);
      setError('Ödeme bilgileri yüklenirken bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(amount);
  };

  const getStatusConfig = (status: PaymentStatus) => {
    return STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={TarodanColors.primary} />
          <Text style={styles.loadingText}>Ödeme durumu kontrol ediliyor...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <View style={styles.errorIconCircle}>
            <Ionicons name="warning-outline" size={40} color={TarodanColors.error} />
          </View>
          <Text style={styles.errorTitle}>Bir Hata Oluştu</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={fetchPaymentDetails}
            activeOpacity={0.8}
          >
            <Ionicons name="refresh-outline" size={18} color="#FFFFFF" />
            <Text style={styles.retryButtonText}>Tekrar Dene</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!payment) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="document-outline" size={48} color={TarodanColors.textTertiary} />
          <Text style={styles.errorTitle}>Ödeme Bulunamadı</Text>
          <Text style={styles.errorMessage}>İstenen ödeme kaydı bulunamadı.</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Text style={styles.retryButtonText}>Geri Dön</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const statusConfig = getStatusConfig(payment.status);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ödeme Detayı</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.statusSection}>
          <View style={[styles.statusIconCircle, { backgroundColor: statusConfig.bgColor }]}>
            <Ionicons name={statusConfig.icon as any} size={36} color={statusConfig.color} />
          </View>
          <View style={[styles.statusPill, { backgroundColor: statusConfig.bgColor }]}>
            <Text style={[styles.statusPillText, { color: statusConfig.color }]}>
              {statusConfig.label}
            </Text>
          </View>
        </View>

        <View style={styles.detailsCard}>
          {payment.amount != null && (
            <>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Tutar</Text>
                <Text style={styles.amountValue}>{formatCurrency(payment.amount)}</Text>
              </View>
              <View style={styles.divider} />
            </>
          )}

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Ödeme Sağlayıcı</Text>
            <Text style={styles.detailValue}>
              {payment.provider === 'paytr' ? 'PayTR' : payment.provider === 'iyzico' ? 'iyzico' : payment.provider || '—'}
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Ödeme ID</Text>
            <Text style={styles.detailValueMono}>{id}</Text>
          </View>

          {payment.orderId && (
            <>
              <View style={styles.divider} />
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Sipariş ID</Text>
                <Text style={styles.detailValueMono}>#{payment.orderId}</Text>
              </View>
            </>
          )}

          {payment.createdAt && (
            <>
              <View style={styles.divider} />
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Tarih</Text>
                <Text style={styles.detailValue}>
                  {new Date(payment.createdAt).toLocaleDateString('tr-TR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
            </>
          )}
        </View>

        {payment.status === 'processing' && (
          <View style={styles.processingBox}>
            <ActivityIndicator size="small" color={TarodanColors.info} />
            <Text style={styles.processingText}>
              Ödemeniz işleniyor. Bu işlem birkaç dakika sürebilir.
            </Text>
          </View>
        )}

        <View style={styles.buttonContainer}>
          {payment.orderId && (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => router.push(`/orders/${payment.orderId}`)}
              activeOpacity={0.8}
            >
              <Ionicons name="receipt-outline" size={20} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>Siparişi Görüntüle</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.replace('/')}
            activeOpacity={0.8}
          >
            <Ionicons name="home-outline" size={20} color={TarodanColors.primary} />
            <Text style={styles.secondaryButtonText}>Ana Sayfa</Text>
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  errorIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: TarodanColors.errorLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: TarodanColors.textPrimary,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 8,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: TarodanColors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 8,
  },
  retryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: TarodanColors.borderLight,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: TarodanColors.backgroundTertiary,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: TarodanColors.textPrimary,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
  },
  statusSection: {
    alignItems: 'center',
    marginBottom: 28,
    marginTop: 8,
    gap: 16,
  },
  statusIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusPill: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusPillText: {
    fontSize: 15,
    fontWeight: '700',
  },
  detailsCard: {
    backgroundColor: TarodanColors.surfaceVariant,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: TarodanColors.borderLight,
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
    maxWidth: '55%',
    textAlign: 'right',
  },
  detailValueMono: {
    fontSize: 13,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
    fontFamily: 'monospace',
  },
  amountValue: {
    fontSize: 18,
    fontWeight: '700',
    color: TarodanColors.primary,
  },
  divider: {
    height: 1,
    backgroundColor: TarodanColors.borderLight,
    marginVertical: 12,
  },
  processingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: TarodanColors.infoLight,
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  processingText: {
    flex: 1,
    fontSize: 13,
    color: TarodanColors.info,
    lineHeight: 19,
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

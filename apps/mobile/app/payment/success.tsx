import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TarodanColors } from '../../src/theme/colors';
import { paymentsApi } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';

export default function PaymentSuccessScreen() {
  const { paymentId, orderId, guest } = useLocalSearchParams<{ paymentId?: string; orderId?: string; guest?: string }>();
  const isGuest = guest === 'true';
  const [payment, setPayment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['orders'] });
    // Satın alma sonrası stok / ilan listeleri web ile aynı şekilde tazelensin
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['listings'] });
    queryClient.invalidateQueries({ queryKey: ['my-listings'] });
    queryClient.invalidateQueries({ queryKey: ['category-products'] });
    queryClient.invalidateQueries({ queryKey: ['seller-products'] });
    queryClient.invalidateQueries({
      predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'product',
    });
    if (!isGuest) {
      void useAuthStore.getState().refreshUserData();
    }
  }, [queryClient, isGuest]);

  useEffect(() => {
    if (paymentId) {
      fetchPaymentDetails();
    } else {
      setLoading(false);
    }
  }, [paymentId]);

  const fetchPaymentDetails = async () => {
    try {
      const response = isGuest
        ? await paymentsApi.getStatusLightGuest(paymentId!)
        : await paymentsApi.getStatus(paymentId!);
      const data = response.data?.payment || response.data?.data || response.data;
      setPayment(data);

      const isMembershipOrder =
        data?.metadata?.type === 'membership' ||
        data?.orderType === 'membership' ||
        data?.isMembershipPayment;

      if (isMembershipOrder) {
        await useAuthStore.getState().refreshUserData();
        router.replace('/membership/success');
        return;
      }
    } catch (error) {
      console.error('Payment details fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(amount);
  };

  const getEstimatedDelivery = () => {
    const date = new Date();
    let businessDays = 0;
    while (businessDays < 3) {
      date.setDate(date.getDate() + 1);
      const day = date.getDay();
      if (day !== 0 && day !== 6) businessDays++;
    }
    return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
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
          <View style={styles.successCircle}>
            <Ionicons name="checkmark" size={56} color="#FFFFFF" />
          </View>
        </View>

        <Text style={styles.title}>Ödeme Başarıyla Tamamlandı!</Text>
        <Text style={styles.subtitle}>
          Siparişiniz onaylandı ve işleme alındı.
        </Text>

        <View style={styles.detailsCard}>
          <Text style={styles.cardTitle}>Ödeme Detayları</Text>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Tutar</Text>
            <Text style={styles.detailValue}>
              {payment?.amount ? formatCurrency(payment.amount) : '—'}
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Ödeme Yöntemi</Text>
            <Text style={styles.detailValue}>PayTR</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Durum</Text>
            <View style={styles.statusBadge}>
              <Ionicons name="checkmark-circle" size={16} color={TarodanColors.success} />
              <Text style={styles.statusText}>Tamamlandı</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Tahmini Teslimat</Text>
            <Text style={styles.detailValue}>{getEstimatedDelivery()}</Text>
          </View>
        </View>

        <View style={styles.infoBox}>
          <Ionicons name="mail-outline" size={20} color={TarodanColors.info} />
          <Text style={styles.infoText}>
            Sipariş onay e-postası gönderildi. Lütfen gelen kutunuzu kontrol edin.
          </Text>
        </View>

        <View style={styles.buttonContainer}>
          {isGuest ? (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => router.replace('/order-track')}
              activeOpacity={0.8}
            >
              <Ionicons name="search-outline" size={20} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>Siparişimi Takip Et</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => router.replace(`/orders/${orderId || payment?.orderId || ''}`)}
              activeOpacity={0.8}
            >
              <Ionicons name="receipt-outline" size={20} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>Siparişimi Görüntüle</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.replace('/')}
            activeOpacity={0.8}
          >
            <Ionicons name="storefront-outline" size={20} color={TarodanColors.primary} />
            <Text style={styles.secondaryButtonText}>Alışverişe Devam Et</Text>
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
  successCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: TarodanColors.success,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: TarodanColors.success,
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
    backgroundColor: TarodanColors.successLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
    color: TarodanColors.success,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: TarodanColors.infoLight,
    padding: 16,
    borderRadius: 12,
    marginBottom: 32,
  },
  infoText: {
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

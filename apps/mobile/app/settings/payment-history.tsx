import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TarodanColors } from '../../src/theme';
import { useAuthStore } from '../../src/stores/authStore';
import { api, membershipApi } from '../../src/services/api';

interface Payment {
  id: string;
  amount: number;
  status: 'completed' | 'failed' | 'pending';
  method: string;
  description: string;
  createdAt: string;
  periodStart?: string;
  periodEnd?: string;
  invoiceUrl?: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  completed: { label: 'Tamamlandı', color: TarodanColors.success, icon: 'checkmark-circle' },
  paid: { label: 'Tamamlandı', color: TarodanColors.success, icon: 'checkmark-circle' },
  failed: { label: 'Başarısız', color: TarodanColors.error, icon: 'close-circle' },
  pending: { label: 'Bekliyor', color: TarodanColors.warning, icon: 'time' },
};

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatCurrency(amount: number): string {
  return `₺${amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PaymentHistoryScreen() {
  const { isAuthenticated } = useAuthStore();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchPayments = useCallback(async (showRefresh = false) => {
    if (!isAuthenticated) return;
    if (showRefresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      let data: Payment[] = [];
      try {
        const res = await api.get('/payments/history');
        data = res.data?.data || res.data || [];
      } catch {
        const res = await membershipApi.getBillingHistory();
        data = res.data?.data || res.data || [];
      }
      setPayments(data);
    } catch (err: any) {
      if (!showRefresh) {
        Alert.alert('Hata', 'Ödeme geçmişi yüklenirken bir hata oluştu.');
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isAuthenticated]);

  useFocusEffect(
    useCallback(() => {
      fetchPayments();
    }, [fetchPayments])
  );

  const handlePaymentPress = (payment: Payment) => {
    Alert.alert(
      'Ödeme Detayı',
      [
        `Tutar: ${formatCurrency(payment.amount)}`,
        `Tarih: ${formatDate(payment.createdAt)}`,
        `Durum: ${STATUS_CONFIG[payment.status]?.label || payment.status}`,
        `Yöntem: ${payment.method || '-'}`,
        payment.description ? `Açıklama: ${payment.description}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
      [{ text: 'Tamam' }]
    );
  };

  const renderPaymentItem = ({ item }: { item: Payment }) => {
    const statusCfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;

    return (
      <TouchableOpacity style={styles.paymentItem} onPress={() => handlePaymentPress(item)} activeOpacity={0.7}>
        <View style={[styles.statusIconContainer, { backgroundColor: statusCfg.color + '15' }]}>
          <Ionicons name={statusCfg.icon as any} size={24} color={statusCfg.color} />
        </View>

        <View style={styles.paymentInfo}>
          <Text style={styles.paymentDescription} numberOfLines={1}>
            {item.description || 'Ödeme'}
          </Text>
          <Text style={styles.paymentDate}>{formatDate(item.createdAt)}</Text>
          {item.method ? <Text style={styles.paymentMethod}>{item.method}</Text> : null}
        </View>

        <View style={styles.paymentRight}>
          <Text style={styles.paymentAmount}>{formatCurrency(item.amount)}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusCfg.color + '15' }]}>
            <Text style={[styles.statusBadgeText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBackBtn}>
            <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Ödeme Geçmişi</Text>
          <View style={styles.headerPlaceholder} />
        </View>
        <View style={styles.centeredContainer}>
          <Ionicons name="log-in-outline" size={48} color={TarodanColors.textTertiary} />
          <Text style={styles.emptyTitle}>Giriş Yapın</Text>
          <Text style={styles.emptySubtitle}>Ödeme geçmişinizi görmek için giriş yapın</Text>
          <TouchableOpacity style={styles.loginButton} onPress={() => router.push('/(auth)/login')}>
            <Text style={styles.loginButtonText}>Giriş Yap</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBackBtn}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ödeme Geçmişi</Text>
        <View style={styles.headerPlaceholder} />
      </View>

      {isLoading ? (
        <View style={styles.centeredContainer}>
          <ActivityIndicator size="large" color={TarodanColors.primary} />
        </View>
      ) : (
        <FlatList
          data={payments}
          keyExtractor={(item) => item.id}
          renderItem={renderPaymentItem}
          contentContainerStyle={payments.length === 0 ? styles.emptyListContainer : styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => fetchPayments(true)}
              colors={[TarodanColors.primary]}
              tintColor={TarodanColors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="receipt-outline" size={48} color={TarodanColors.textTertiary} />
              </View>
              <Text style={styles.emptyTitle}>Ödeme geçmişiniz bulunmuyor</Text>
              <Text style={styles.emptySubtitle}>Yaptığınız ödemeler burada listelenecektir</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  header: {
    backgroundColor: TarodanColors.primary,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerBackBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TarodanColors.textOnPrimary,
  },
  headerPlaceholder: {
    width: 32,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  listContent: {
    padding: 16,
  },
  emptyListContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  paymentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TarodanColors.background,
    borderRadius: 12,
    padding: 16,
  },
  statusIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  paymentInfo: {
    flex: 1,
    marginRight: 12,
  },
  paymentDescription: {
    fontSize: 15,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
    marginBottom: 2,
  },
  paymentDate: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
  },
  paymentMethod: {
    fontSize: 12,
    color: TarodanColors.textTertiary,
    marginTop: 2,
  },
  paymentRight: {
    alignItems: 'flex-end',
  },
  paymentAmount: {
    fontSize: 15,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    marginBottom: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  separator: {
    height: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: TarodanColors.backgroundTertiary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
    marginTop: 8,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
    textAlign: 'center',
  },
  loginButton: {
    marginTop: 20,
    backgroundColor: TarodanColors.primary,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 10,
  },
  loginButtonText: {
    color: TarodanColors.textOnPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
});

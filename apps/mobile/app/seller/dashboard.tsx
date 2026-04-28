import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TarodanColors } from '../../src/theme/colors';
import { useAuthStore } from '../../src/stores/authStore';
import { api, ordersApi } from '../../src/services/api';

interface SellerStats {
  totalSales: number;
  totalRevenue: number;
  activeListings: number;
  pendingOrders: number;
}

interface RecentOrder {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  product: {
    id: string;
    title: string;
  };
  buyer: {
    id: string;
    displayName: string;
  };
  createdAt: string;
}

export default function SellerDashboardScreen() {
  const { isAuthenticated, user } = useAuthStore();
  const [stats, setStats] = useState<SellerStats | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, ordersRes] = await Promise.all([
        api.get('/users/me/stats'),
        ordersApi.getAll({ type: 'seller', limit: 5 }),
      ]);
      setStats(statsRes.data?.data || statsRes.data);
      setRecentOrders(ordersRes.data?.data || ordersRes.data || []);
    } catch (error) {
      console.log('Failed to fetch seller dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
    } else {
      setLoading(false);
    }
  }, [isAuthenticated, fetchData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const formatPrice = (price: number) => {
    return `₺${(price || 0).toLocaleString('tr-TR')}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'short',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': case 'pending_payment': return TarodanColors.warning;
      case 'paid': return TarodanColors.info;
      case 'processing': return TarodanColors.info;
      case 'shipped': return TarodanColors.primary;
      case 'delivered': case 'completed': return TarodanColors.success;
      case 'cancelled': return TarodanColors.error;
      default: return TarodanColors.textSecondary;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': case 'pending_payment': return 'Ödeme Bekliyor';
      case 'paid': return 'Ödendi';
      case 'processing': return 'Hazırlanıyor';
      case 'shipped': return 'Kargoda';
      case 'delivered': return 'Teslim Edildi';
      case 'completed': return 'Tamamlandı';
      case 'cancelled': return 'İptal';
      default: return status;
    }
  };

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centeredContainer}>
          <Ionicons name="storefront-outline" size={64} color={TarodanColors.primary} />
          <Text style={styles.emptyTitle}>Satıcı Paneli</Text>
          <Text style={styles.emptySubtitle}>Panele erişmek için giriş yapın</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/(auth)/login')}>
            <Text style={styles.primaryButtonText}>Giriş Yap</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centeredContainer}>
          <ActivityIndicator size="large" color={TarodanColors.primary} />
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
        <Text style={styles.headerTitle}>Satıcı Paneli</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[TarodanColors.primary]} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Welcome */}
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeText}>Merhaba, {user?.displayName || 'Satıcı'}</Text>
          <Text style={styles.welcomeSubtext}>İşte satış özetin</Text>
        </View>

        {/* Stats Cards */}
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { backgroundColor: TarodanColors.primaryLight }]}>
            <Ionicons name="cart-outline" size={28} color={TarodanColors.primary} />
            <Text style={styles.statValue}>{stats?.totalSales ?? 0}</Text>
            <Text style={styles.statLabel}>Toplam Satış</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: TarodanColors.accentLight }]}>
            <Ionicons name="cash-outline" size={28} color={TarodanColors.accent} />
            <Text style={[styles.statValue, { color: TarodanColors.accent }]}>
              {formatPrice(stats?.totalRevenue ?? 0)}
            </Text>
            <Text style={styles.statLabel}>Toplam Gelir</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: TarodanColors.accentBlueLite }]}>
            <Ionicons name="pricetag-outline" size={28} color={TarodanColors.accentBlue} />
            <Text style={[styles.statValue, { color: TarodanColors.accentBlue }]}>
              {stats?.activeListings ?? 0}
            </Text>
            <Text style={styles.statLabel}>Aktif İlan</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: TarodanColors.warningLight }]}>
            <Ionicons name="time-outline" size={28} color={TarodanColors.warning} />
            <Text style={[styles.statValue, { color: TarodanColors.warning }]}>
              {stats?.pendingOrders ?? 0}
            </Text>
            <Text style={styles.statLabel}>Bekleyen Sipariş</Text>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Hızlı İşlemler</Text>
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/sell')}>
              <View style={[styles.actionIconWrap, { backgroundColor: TarodanColors.primaryLight }]}>
                <Ionicons name="add-circle-outline" size={24} color={TarodanColors.primary} />
              </View>
              <Text style={styles.actionText}>Yeni İlan Oluştur</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/sales')}>
              <View style={[styles.actionIconWrap, { backgroundColor: TarodanColors.accentLight }]}>
                <Ionicons name="receipt-outline" size={24} color={TarodanColors.accent} />
              </View>
              <Text style={styles.actionText}>Siparişlerimi Gör</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Recent Orders */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Son Siparişler</Text>
            {recentOrders.length > 0 && (
              <TouchableOpacity onPress={() => router.push('/sales')}>
                <Text style={styles.seeAllText}>Tümünü Gör</Text>
              </TouchableOpacity>
            )}
          </View>

          {recentOrders.length === 0 ? (
            <View style={styles.emptyOrdersCard}>
              <Ionicons name="receipt-outline" size={40} color={TarodanColors.textTertiary} />
              <Text style={styles.emptyOrdersText}>Henüz sipariş yok</Text>
            </View>
          ) : (
            recentOrders.map((order) => (
              <TouchableOpacity
                key={order.id}
                style={styles.orderCard}
                onPress={() => router.push(`/sales/${order.id}`)}
              >
                <View style={styles.orderCardTop}>
                  <Text style={styles.orderNumber}>#{order.orderNumber}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(order.status) + '20' }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(order.status) }]}>
                      {getStatusText(order.status)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.orderProductTitle} numberOfLines={1}>{order.product.title}</Text>
                <View style={styles.orderCardBottom}>
                  <Text style={styles.orderBuyer}>
                    <Ionicons name="person-outline" size={12} color={TarodanColors.textSecondary} />{' '}
                    {order.buyer.displayName}
                  </Text>
                  <Text style={styles.orderPrice}>{formatPrice(order.totalAmount)}</Text>
                </View>
                <Text style={styles.orderDate}>{formatDate(order.createdAt)}</Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
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
  welcomeSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  welcomeText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
  },
  welcomeSubtext: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
    marginTop: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  statCard: {
    width: '46%',
    margin: '2%',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: TarodanColors.primary,
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  section: {
    paddingHorizontal: 20,
    marginTop: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: TarodanColors.textPrimary,
    marginBottom: 12,
  },
  seeAllText: {
    fontSize: 14,
    color: TarodanColors.primary,
    fontWeight: '600',
    marginBottom: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    backgroundColor: TarodanColors.background,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: TarodanColors.border,
  },
  actionIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
    textAlign: 'center',
  },
  orderCard: {
    backgroundColor: TarodanColors.background,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: TarodanColors.border,
  },
  orderCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  orderNumber: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
    fontWeight: '500',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  orderProductTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
    marginBottom: 8,
  },
  orderCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderBuyer: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
  },
  orderPrice: {
    fontSize: 15,
    fontWeight: 'bold',
    color: TarodanColors.primary,
  },
  orderDate: {
    fontSize: 12,
    color: TarodanColors.textTertiary,
    marginTop: 6,
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
  emptyOrdersCard: {
    backgroundColor: TarodanColors.background,
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: TarodanColors.border,
  },
  emptyOrdersText: {
    fontSize: 14,
    color: TarodanColors.textTertiary,
    marginTop: 8,
  },
});

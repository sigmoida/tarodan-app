import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { Card, Text, theme } from '@tarodan/ui-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { userApi, ordersApi, productsApi } from '../../src/services/api';
import { ScreenHeader, EmptyState, ScreenLoader } from '../../src/components/common';
import { formatPrice } from '../../src/utils/format';
import { useAuthStore } from '../../src/stores/authStore';

const { colors } = theme;

interface SellerStats {
  activeListings?: number;
  pendingListings?: number;
  soldListings?: number;
  totalListings?: number;
  pendingOrders?: number;
  shippedOrders?: number;
  completedOrders?: number;
  totalOrders?: number;
  monthlySales?: number;
  totalSales?: number;
  averageRating?: number;
  ratingCount?: number;
  unreadMessages?: number;
}

function StatCard({
  icon,
  label,
  value,
  color,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string | number;
  color: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.statCard}
      onPress={onPress}
      activeOpacity={0.8}
      disabled={!onPress}
    >
      <View style={[styles.statIconWrap, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
  color = colors.primary[600]!,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  onPress: () => void;
  color?: string;
}) {
  return (
    <TouchableOpacity style={styles.quickAction} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.quickIconWrap, { backgroundColor: color + '20' }]}>
        <MaterialCommunityIcons name={icon} size={22} color={color} />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function SellerDashboardScreen() {
  const { user, isAuthenticated } = useAuthStore();

  const statsQuery = useQuery<SellerStats>({
    queryKey: ['seller-stats'],
    queryFn: async () => {
      const response = await userApi.getStats();
      return response.data?.data ?? response.data ?? {};
    },
    enabled: isAuthenticated,
  });

  const pendingOrdersQuery = useQuery({
    queryKey: ['seller-pending-orders'],
    queryFn: async () => {
      const response = await ordersApi.getAll({ role: 'seller', status: 'paid' });
      const payload = response.data?.data ?? response.data ?? [];
      return Array.isArray(payload) ? payload.length : 0;
    },
    enabled: isAuthenticated,
  });

  const myListingsQuery = useQuery({
    queryKey: ['seller-my-listings-count'],
    queryFn: async () => {
      const response = await productsApi.getMyListings({ status: 'active' });
      const payload = response.data?.data ?? response.data ?? [];
      return Array.isArray(payload) ? payload.length : payload?.total ?? 0;
    },
    enabled: isAuthenticated,
  });

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title="Satıcı Paneli" />
        <EmptyState
          fullscreen
          icon="storefront-outline"
          title="Satıcı paneli için giriş yapın"
          actionLabel="Giriş Yap"
          onAction={() => router.push('/(auth)/login')}
        />
      </SafeAreaView>
    );
  }

  const isLoading = statsQuery.isLoading && pendingOrdersQuery.isLoading && myListingsQuery.isLoading;
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title="Satıcı Paneli" />
        <ScreenLoader />
      </SafeAreaView>
    );
  }

  const stats = statsQuery.data ?? {};
  const activeListings = myListingsQuery.data ?? stats.activeListings ?? 0;
  const pendingOrders = pendingOrdersQuery.data ?? stats.pendingOrders ?? 0;
  const monthly = stats.monthlySales ?? 0;
  const rating = stats.averageRating ?? 0;

  const isBusiness = user?.membershipTier === 'business';

  const refresh = () => {
    statsQuery.refetch();
    pendingOrdersQuery.refetch();
    myListingsQuery.refetch();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Satıcı Paneli" subtitle={user?.displayName} />
      <ScrollView
        contentContainerStyle={styles.scrollBody}
        refreshControl={
          <RefreshControl
            refreshing={statsQuery.isRefetching}
            onRefresh={refresh}
            colors={[colors.primary[600]!]}
            tintColor={colors.primary[600]!}
          />
        }
      >
        {/* Welcome */}
        <View style={styles.welcomeCard}>
          <MaterialCommunityIcons name="storefront" size={28} color={colors.primary[600]!} />
          <View style={{ flex: 1 }}>
            <Text style={styles.welcomeTitle}>
              {isBusiness ? 'Kurumsal Satıcı Paneli' : 'Hoş Geldin!'}
            </Text>
            <Text style={styles.welcomeSubtitle}>
              {isBusiness
                ? 'İşletme hesabınla satış yapıyorsun.'
                : 'Daha fazla avantaj için işletme hesabına yükselebilirsin.'}
            </Text>
          </View>
          {!isBusiness ? (
            <TouchableOpacity
              style={styles.upgradeBtn}
              onPress={() => router.push('/seller/register')}
            >
              <Text style={styles.upgradeBtnText}>Yükselt</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Stats grid */}
        <View style={styles.statsGrid}>
          <StatCard
            icon="pricetag"
            label="Aktif İlan"
            value={activeListings}
            color={colors.primary[600]!}
            onPress={() => router.push('/settings/my-listings')}
          />
          <StatCard
            icon="cube"
            label="Bekleyen Sipariş"
            value={pendingOrders}
            color={colors.warning[600]!}
            onPress={() => router.push('/sales')}
          />
          <StatCard
            icon="cash"
            label="Bu Ay Satış"
            value={formatPrice(monthly)}
            color={colors.success[600]!}
          />
          <StatCard
            icon="star"
            label="Puan"
            value={rating > 0 ? rating.toFixed(1) : '—'}
            color={colors.warning[500]!}
          />
        </View>

        {/* Quick actions */}
        <Card style={styles.actionsCard}>
          <Text style={styles.sectionTitle}>Hızlı İşlemler</Text>
          <View style={styles.quickGrid}>
            <QuickAction
              icon="plus-circle-outline"
              label="Yeni İlan"
              onPress={() => router.push('/(tabs)/create')}
              color={colors.primary[600]!}
            />
            <QuickAction
              icon="format-list-bulleted"
              label="İlanlarım"
              onPress={() => router.push('/settings/my-listings')}
              color={colors.info[600]!}
            />
            <QuickAction
              icon="cube-send"
              label="Satışlarım"
              onPress={() => router.push('/sales')}
              color={colors.warning[500]!}
            />
            <QuickAction
              icon="chart-line"
              label="Analitik"
              onPress={() => router.push('/settings/analytics')}
              color={colors.warning[500]!}
            />
            <QuickAction
              icon="message-text-outline"
              label="Mesajlar"
              onPress={() => router.push('/(tabs)/messages')}
              color={colors.info[600]!}
            />
            <QuickAction
              icon="account-cog-outline"
              label="İşletme Bilgileri"
              onPress={() => router.push('/seller/register')}
              color={colors.gray[200]}
            />
          </View>
        </Card>

        {/* Summary */}
        {stats.totalListings || stats.totalOrders ? (
          <Card style={styles.summaryCard}>
            <Text style={styles.sectionTitle}>Toplam Özet</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Toplam İlan</Text>
              <Text style={styles.summaryValue}>{stats.totalListings ?? 0}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Toplam Sipariş</Text>
              <Text style={styles.summaryValue}>{stats.totalOrders ?? 0}</Text>
            </View>
            {stats.totalSales ? (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Toplam Satış</Text>
                <Text style={[styles.summaryValue, { color: colors.primary[600]! }]}>
                  {formatPrice(stats.totalSales)}
                </Text>
              </View>
            ) : null}
            {stats.ratingCount ? (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Değerlendirme Sayısı</Text>
                <Text style={styles.summaryValue}>{stats.ratingCount}</Text>
              </View>
            ) : null}
          </Card>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  scrollBody: {
    padding: 16,
    gap: 14,
  },
  welcomeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: colors.primary[50]!,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary[200]!,
  },
  welcomeTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.heading,
  },
  welcomeSubtitle: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
  },
  upgradeBtn: {
    backgroundColor: colors.primary[600]!,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  upgradeBtnText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    flexBasis: '48%',
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.DEFAULT,
  },
  statIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text.heading,
  },
  statLabel: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
  },
  actionsCard: {
    backgroundColor: colors.surface.DEFAULT,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.heading,
    marginBottom: 12,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  quickAction: {
    width: '33.333%',
    alignItems: 'center',
    padding: 8,
  },
  quickIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  quickLabel: {
    fontSize: 11,
    color: colors.text.heading,
    textAlign: 'center',
  },
  summaryCard: {
    backgroundColor: colors.surface.DEFAULT,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  summaryLabel: {
    fontSize: 13,
    color: colors.text.muted,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.heading,
  },
});

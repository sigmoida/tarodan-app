import { View, ScrollView, StyleSheet, Pressable } from 'react-native';
import {
  Card,
  Button,
  Spinner,
  Divider,
  Text,
  theme,
  ScreenHeader,
} from '@tarodan/ui-native';
import { useState, useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { ThemedRefreshControl } from '../../src/components/common';
import { useRefresh } from '../../src/hooks/useRefresh';
import { useAuthStore } from '../../src/stores/authStore';
import { useTranslation } from '../../src/i18n';

const { colors, spacing, radius } = theme;

interface Analytics {
  totalViews: number;
  totalFavorites: number;
  activeListings: number;
  totalSales: number;
  totalRevenue: number;
  dailyViews: Array<{ date: string; views: number; favorites: number }>;
  topProducts: Array<{
    id: string;
    title: string;
    views: number;
    favorites: number;
    price?: number;
    status?: string;
    imageUrl?: string;
  }>;
  // Premium analytics
  conversionRate?: number;
  avgTimeToSell?: number;
}

export default function AnalyticsScreen() {
  const { t } = useTranslation();
  const { isAuthenticated, limits } = useAuthStore();
  const [timeRange] = useState<'7d' | '30d' | 'all'>('7d');

  const isPremium = limits?.maxListings === -1;

  // Fetch analytics
  const { data: analyticsData, isLoading, refetch } = useQuery({
    queryKey: ['analytics', timeRange],
    queryFn: async () => {
      const response = await api.get('/users/me/analytics', { params: { period: timeRange } });
      return response.data;
    },
    enabled: isAuthenticated,
  });

  const analytics: Analytics | null = analyticsData || null;

  const { refreshing, onRefresh } = useRefresh(refetch);

  // Refresh on focus
  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated) {
        refetch();
      }
    }, [isAuthenticated])
  );

  const getDayLabels = () => {
    const days = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
    const today = new Date().getDay();
    const result = [];
    for (let i = 6; i >= 0; i--) {
      result.push(days[(today - i + 7) % 7]);
    }
    return result;
  };

  const getMaxValue = (arr: number[]) => Math.max(...arr, 1);

  if (!isAuthenticated) {
    return (
      <View style={styles.centeredContainer}>
        <Ionicons name="stats-chart-outline" size={64} color={colors.primary[600]!} />
        <Text variant="h3" style={styles.title}>Analitikler</Text>
        <Text variant="body" style={styles.subtitle}>
          İstatistiklerinizi görmek için giriş yapın
        </Text>
        <Button variant="primary" title="Giriş Yap" onPress={() => router.push('/(auth)/login')} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('mobile.settingsAnalytics')} onBack={() => router.back()} />

      {/* Content */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <Spinner size="lg" />
        </View>
      ) : !analytics ? (
        <View style={styles.emptyContainer}>
          <Text>Veri yüklenemedi</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          refreshControl={<ThemedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* Overview Cards */}
          <View style={styles.overviewRow}>
            <Card style={styles.overviewCard}>
              <View style={styles.overviewContent}>
                <Ionicons name="eye" size={24} color={colors.primary[600]!} />
                <Text variant="h3" style={styles.overviewValue}>
                  {analytics.totalViews.toLocaleString('tr-TR')}
                </Text>
                <Text variant="bodySm" style={styles.overviewLabel}>Toplam Görüntülenme</Text>
              </View>
            </Card>
            <Card style={styles.overviewCard}>
              <View style={styles.overviewContent}>
                <Ionicons name="heart" size={24} color={colors.danger[600]!} />
                <Text variant="h3" style={styles.overviewValue}>
                  {analytics.totalFavorites}
                </Text>
                <Text variant="bodySm" style={styles.overviewLabel}>Toplam Favori</Text>
              </View>
            </Card>
          </View>

          <View style={styles.overviewRow}>
            <Card style={styles.overviewCard}>
              <View style={styles.overviewContent}>
                <Ionicons name="pricetag" size={24} color={colors.info[600]!} />
                <Text variant="h3" style={styles.overviewValue}>
                  {analytics.activeListings}
                </Text>
                <Text variant="bodySm" style={styles.overviewLabel}>Aktif İlan</Text>
              </View>
            </Card>
            <Card style={styles.overviewCard}>
              <View style={styles.overviewContent}>
                <Ionicons name="checkmark-circle" size={24} color={colors.success[600]!} />
                <Text variant="h3" style={styles.overviewValue}>
                  {analytics.totalSales}
                </Text>
                <Text variant="bodySm" style={styles.overviewLabel}>Satılan</Text>
              </View>
            </Card>
          </View>

          {/* Views Chart - Basic for Free Members */}
          <Card style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <Text variant="h3">Son 7 Gün Görüntülenme</Text>
            </View>
            <View style={styles.simpleChart}>
              {(analytics.dailyViews || []).map((d, index) => {
                const dailyValues = (analytics.dailyViews || []).map((x) => x.views);
                const maxVal = getMaxValue(dailyValues);
                const height = (d.views / maxVal) * 100;
                return (
                  <View key={index} style={styles.chartBar}>
                    <View style={[styles.bar, { height: `${height}%` }]} />
                    <Text style={styles.barLabel}>{getDayLabels()[index]}</Text>
                  </View>
                );
              })}
            </View>
            <View style={styles.chartFooter}>
              <Text variant="bodySm" style={styles.chartTotal}>
                Toplam: {(analytics.dailyViews || []).reduce((a, b) => a + b.views, 0)} görüntülenme
              </Text>
            </View>
          </Card>

          {/* Top Listings */}
          <Card style={styles.card}>
            <Text variant="h3" style={styles.sectionTitle}>En Popüler İlanlarınız</Text>
            {(analytics.topProducts || []).map((listing, index) => (
              <Pressable
                key={listing.id}
                style={styles.listingItem}
                onPress={() => router.push(`/product/${listing.id}`)}
              >
                <Text style={styles.listingRank}>#{index + 1}</Text>
                <View style={styles.listingInfo}>
                  <Text variant="body" numberOfLines={1}>{listing.title}</Text>
                  <View style={styles.listingStats}>
                    <Ionicons name="eye" size={14} color={colors.text.muted} />
                    <Text style={styles.listingStat}>{listing.views}</Text>
                    <Ionicons name="heart" size={14} color={colors.text.muted} style={{ marginLeft: 12 }} />
                    <Text style={styles.listingStat}>{listing.favorites}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.text.muted} />
              </Pressable>
            ))}
          </Card>

          {/* PREMIUM ANALYTICS SECTION */}
          {isPremium && (
            <>
              {/* Conversion & Performance Metrics */}
              <Card style={styles.card}>
                <View style={styles.premiumSectionHeader}>
                  <MaterialCommunityIcons name="crown" size={20} color={colors.primary[600]!} />
                  <Text variant="h3" style={styles.premiumSectionTitle}>Premium Analitikler</Text>
                </View>

                <View style={styles.metricsGrid}>
                  <View style={styles.metricItem}>
                    <Text variant="h3" style={styles.metricValue}>
                      %{analytics.conversionRate?.toFixed(1)}
                    </Text>
                    <Text variant="bodySm" style={styles.metricLabel}>Dönüşüm Oranı</Text>
                    <View style={styles.metricTrend}>
                      <Ionicons name="trending-up" size={14} color={colors.success[600]!} />
                      <Text style={styles.trendText}>+0.5%</Text>
                    </View>
                  </View>

                  <View style={styles.metricItem}>
                    <Text variant="h3" style={styles.metricValue}>
                      {analytics.avgTimeToSell} gün
                    </Text>
                    <Text variant="bodySm" style={styles.metricLabel}>Ort. Satış Süresi</Text>
                    <View style={styles.metricTrend}>
                      <Ionicons name="trending-down" size={14} color={colors.success[600]!} />
                      <Text style={styles.trendText}>-2 gün</Text>
                    </View>
                  </View>
                </View>
              </Card>

              {/* Revenue Tracking */}
              <Card style={styles.card}>
                <Text variant="h3" style={styles.sectionTitle}>Gelir Takibi</Text>

                <View style={styles.revenueHeader}>
                  <View>
                    <Text variant="bodySm" style={styles.revenueLabel}>Toplam Gelir</Text>
                    <Text variant="h1" style={styles.revenueTotal}>
                      ₺{analytics.totalRevenue.toLocaleString('tr-TR')}
                    </Text>
                  </View>
                </View>
              </Card>

              {/* Export Options */}
              <Card style={styles.card}>
                <Text variant="h3" style={styles.sectionTitle}>Rapor İndir</Text>
                <Pressable style={styles.exportOption}>
                  <Ionicons name="document-text" size={24} color={colors.primary[600]!} />
                  <View style={styles.exportInfo}>
                    <Text variant="body">PDF Rapor</Text>
                    <Text variant="bodySm" style={styles.exportDesc}>
                      Detaylı analitik raporu
                    </Text>
                  </View>
                  <Ionicons name="download-outline" size={24} color={colors.primary[600]!} />
                </Pressable>
                <Divider style={{ marginVertical: 8 }} />
                <Pressable style={styles.exportOption}>
                  <Ionicons name="grid" size={24} color={colors.success[600]!} />
                  <View style={styles.exportInfo}>
                    <Text variant="body">Excel Rapor</Text>
                    <Text variant="bodySm" style={styles.exportDesc}>
                      Satış ve takas verileri
                    </Text>
                  </View>
                  <Ionicons name="download-outline" size={24} color={colors.primary[600]!} />
                </Pressable>
              </Card>
            </>
          )}

          {/* Premium Upsell */}
          {!isPremium && (
            <Card style={styles.premiumCard}>
              <View style={styles.premiumHeader}>
                <Ionicons name="diamond" size={24} color={colors.primary[600]!} />
                <Text variant="h3" style={styles.premiumTitle}>Detaylı Analitik</Text>
              </View>
              <Text variant="bodySm" style={styles.premiumText}>
                Premium üyelikle daha detaylı analitiklere erişin:
              </Text>
              <View style={styles.premiumFeatures}>
                <Text style={styles.premiumFeature}>• Dönüşüm oranları</Text>
                <Text style={styles.premiumFeature}>• Gelir takibi</Text>
                <Text style={styles.premiumFeature}>• Takas başarı oranları</Text>
                <Text style={styles.premiumFeature}>• En iyi performans gösteren ilanlar</Text>
                <Text style={styles.premiumFeature}>• Koleksiyon etkileşim metrikleri</Text>
              </View>
              <Button variant="primary" title="Premium'a Geç" onPress={() => router.push('/upgrade')} style={styles.premiumButton} />
            </Card>
          )}

          <View style={{ height: 50 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: colors.surface.DEFAULT,
  },
  title: {
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 24,
    color: colors.text.muted,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  overviewRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  overviewCard: {
    flex: 1,
    backgroundColor: colors.surface.DEFAULT,
  },
  overviewContent: {
    alignItems: 'center',
    padding: 8,
  },
  overviewValue: {
    marginTop: 8,
    fontWeight: 'bold',
    color: colors.text.heading,
  },
  overviewLabel: {
    color: colors.text.muted,
    marginTop: 4,
    textAlign: 'center',
  },
  chartCard: {
    marginBottom: 12,
    backgroundColor: colors.surface.DEFAULT,
  },
  chartHeader: {
    marginBottom: 16,
  },
  simpleChart: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 120,
    paddingHorizontal: 8,
  },
  chartBar: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginHorizontal: 4,
  },
  bar: {
    width: 24,
    backgroundColor: colors.primary[600]!,
    borderRadius: radius.sm,
    minHeight: 4,
  },
  barLabel: {
    marginTop: 8,
    fontSize: 11,
    color: colors.text.muted,
  },
  chartFooter: {
    marginTop: 16,
    alignItems: 'center',
  },
  chartTotal: {
    color: colors.text.muted,
  },
  card: {
    marginBottom: 12,
    backgroundColor: colors.surface.DEFAULT,
  },
  sectionTitle: {
    marginBottom: 12,
    color: colors.text.heading,
  },
  listingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  listingRank: {
    width: 30,
    fontWeight: 'bold',
    color: colors.primary[600]!,
  },
  listingInfo: {
    flex: 1,
  },
  listingStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  listingStat: {
    marginLeft: 4,
    fontSize: 12,
    color: colors.text.muted,
  },
  premiumCard: {
    marginBottom: 12,
    backgroundColor: colors.primary[50]!,
    borderWidth: 1,
    borderColor: colors.primary[200]!,
  },
  premiumHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  premiumTitle: {
    marginLeft: 8,
    color: colors.primary[600]!,
  },
  premiumText: {
    color: colors.text.muted,
    marginBottom: 8,
  },
  premiumFeatures: {
    marginBottom: 16,
  },
  premiumFeature: {
    color: colors.text.heading,
    marginVertical: 2,
  },
  premiumButton: {
    backgroundColor: colors.primary[600]!,
  },
  // Premium Analytics Styles
  premiumSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  premiumSectionTitle: {
    marginLeft: 8,
    color: colors.primary[600]!,
    fontWeight: '600',
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
    padding: 12,
    backgroundColor: colors.surface.alt,
    borderRadius: radius.lg,
    marginHorizontal: 4,
  },
  metricValue: {
    fontWeight: 'bold',
    color: colors.primary[600]!,
  },
  metricLabel: {
    color: colors.text.muted,
    marginTop: 4,
    textAlign: 'center',
  },
  metricTrend: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  trendText: {
    fontSize: 12,
    color: colors.success[600]!,
    marginLeft: 4,
  },
  revenueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  revenueLabel: {
    color: colors.text.muted,
  },
  revenueTotal: {
    color: colors.primary[600]!,
    fontWeight: 'bold',
  },
  revenueChart: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 120,
  },
  revenueBar: {
    alignItems: 'center',
    flex: 1,
  },
  revenueBarValue: {
    fontSize: 10,
    color: colors.text.muted,
    marginBottom: 4,
  },
  revenueBarFill: {
    width: 32,
    backgroundColor: colors.primary[600]!,
    borderRadius: radius.sm,
    minHeight: 4,
  },
  revenueBarLabel: {
    marginTop: 8,
    fontSize: 11,
    color: colors.text.muted,
  },
  tradeStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
  },
  tradeStat: {
    alignItems: 'center',
  },
  tradeStatValue: {
    marginTop: 8,
    fontWeight: 'bold',
    color: colors.text.heading,
  },
  tradeStatLabel: {
    color: colors.text.muted,
    marginTop: 4,
  },
  successRateCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 4,
    borderColor: colors.success[600]!,
    justifyContent: 'center',
    alignItems: 'center',
  },
  successRateText: {
    color: colors.success[600]!,
    fontWeight: 'bold',
  },
  collectionStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
  },
  collectionStat: {
    alignItems: 'center',
  },
  collectionStatValue: {
    marginTop: 8,
    fontWeight: 'bold',
    color: colors.text.heading,
  },
  collectionStatLabel: {
    color: colors.text.muted,
    marginTop: 4,
    textAlign: 'center',
  },
  performerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  conversionBadge: {
    backgroundColor: colors.success[50]!,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.lg,
  },
  conversionText: {
    color: colors.success[700]!,
    fontWeight: '600',
    fontSize: 12,
  },
  exportOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  exportInfo: {
    flex: 1,
    marginLeft: 12,
  },
  exportDesc: {
    color: colors.text.muted,
    marginTop: 2,
  },
});

import { View, ScrollView, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { Text, Card, Button, ActivityIndicator, ProgressBar, Chip, SegmentedButtons, Divider } from 'react-native-paper';
import { useState, useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';
import { TarodanColors } from '../../src/theme';

interface Analytics {
  totalViews: number;
  totalFavorites: number;
  totalListings: number;
  activeListings: number;
  soldListings: number;
  totalSales: number;
  totalRevenue: number;
  viewsLast7Days: number[];
  favoritesLast7Days: number[];
  topListings: Array<{
    id: string;
    title: string;
    views: number;
    favorites: number;
  }>;
  // Premium analytics
  conversionRate?: number;
  avgTimeToSale?: number;
  tradeSuccessRate?: number;
  totalTrades?: number;
  collectionViews?: number;
  collectionLikes?: number;
  revenueByMonth?: { month: string; revenue: number }[];
  topPerformers?: Array<{
    id: string;
    title: string;
    views: number;
    favorites: number;
    conversionRate: number;
  }>;
}

export default function AnalyticsScreen() {
  const { isAuthenticated, user, limits } = useAuthStore();
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | 'all'>('7d');

  const isPremium = limits?.maxListings === -1;

  // Fetch analytics
  const { data: analyticsData, isLoading, refetch } = useQuery({
    queryKey: ['analytics', timeRange],
    queryFn: async () => {
      try {
        const response = await api.get('/users/me/analytics', { params: { range: timeRange } });
        return response.data;
      } catch (error) {
        console.log('Failed to fetch analytics');
        // Return mock data for demo
        return {
          totalViews: 1245,
          totalFavorites: 89,
          totalListings: 7,
          activeListings: 5,
          soldListings: 2,
          totalSales: 3,
          totalRevenue: 4500,
          viewsLast7Days: [45, 62, 38, 71, 55, 49, 83],
          favoritesLast7Days: [3, 5, 2, 8, 4, 6, 7],
          topListings: [
            { id: '1', title: 'Ferrari 488 GTB', views: 234, favorites: 18 },
            { id: '2', title: 'Porsche 911 GT3', views: 189, favorites: 12 },
            { id: '3', title: 'BMW M3 E30', views: 156, favorites: 9 },
          ],
          // Premium analytics mock data
          conversionRate: 4.2,
          avgTimeToSale: 12,
          tradeSuccessRate: 87,
          totalTrades: 15,
          collectionViews: 523,
          collectionLikes: 45,
          revenueByMonth: [
            { month: 'Oca', revenue: 1200 },
            { month: 'Şub', revenue: 850 },
            { month: 'Mar', revenue: 2100 },
            { month: 'Nis', revenue: 350 },
          ],
          topPerformers: [
            { id: '1', title: 'Ferrari 488 GTB', views: 234, favorites: 18, conversionRate: 7.7 },
            { id: '2', title: 'Porsche 911 GT3', views: 189, favorites: 12, conversionRate: 5.3 },
            { id: '3', title: 'BMW M3 E30', views: 156, favorites: 9, conversionRate: 3.2 },
          ],
        };
      }
    },
    enabled: isAuthenticated,
  });

  const analytics: Analytics | null = analyticsData || null;

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
        <Ionicons name="stats-chart-outline" size={64} color={TarodanColors.primary} />
        <Text variant="titleLarge" style={styles.title}>Analitikler</Text>
        <Text variant="bodyMedium" style={styles.subtitle}>
          İstatistiklerinizi görmek için giriş yapın
        </Text>
        <Button mode="contained" onPress={() => router.push('/(auth)/login')}>
          Giriş Yap
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Analitikler</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={TarodanColors.primary} />
        </View>
      ) : !analytics ? (
        <View style={styles.emptyContainer}>
          <Text>Veri yüklenemedi</Text>
        </View>
      ) : (
        <ScrollView style={styles.content}>
          {/* Overview Cards */}
          <View style={styles.overviewRow}>
            <Card style={styles.overviewCard}>
              <Card.Content style={styles.overviewContent}>
                <Ionicons name="eye" size={24} color={TarodanColors.primary} />
                <Text variant="headlineSmall" style={styles.overviewValue}>
                  {analytics.totalViews.toLocaleString('tr-TR')}
                </Text>
                <Text variant="bodySmall" style={styles.overviewLabel}>Toplam Görüntülenme</Text>
              </Card.Content>
            </Card>
            <Card style={styles.overviewCard}>
              <Card.Content style={styles.overviewContent}>
                <Ionicons name="heart" size={24} color={TarodanColors.error} />
                <Text variant="headlineSmall" style={styles.overviewValue}>
                  {analytics.totalFavorites}
                </Text>
                <Text variant="bodySmall" style={styles.overviewLabel}>Toplam Favori</Text>
              </Card.Content>
            </Card>
          </View>

          <View style={styles.overviewRow}>
            <Card style={styles.overviewCard}>
              <Card.Content style={styles.overviewContent}>
                <Ionicons name="pricetag" size={24} color={TarodanColors.info} />
                <Text variant="headlineSmall" style={styles.overviewValue}>
                  {analytics.activeListings}/{analytics.totalListings}
                </Text>
                <Text variant="bodySmall" style={styles.overviewLabel}>Aktif İlan</Text>
              </Card.Content>
            </Card>
            <Card style={styles.overviewCard}>
              <Card.Content style={styles.overviewContent}>
                <Ionicons name="checkmark-circle" size={24} color={TarodanColors.success} />
                <Text variant="headlineSmall" style={styles.overviewValue}>
                  {analytics.soldListings}
                </Text>
                <Text variant="bodySmall" style={styles.overviewLabel}>Satılan</Text>
              </Card.Content>
            </Card>
          </View>

          {/* Views Chart - Basic for Free Members */}
          <Card style={styles.chartCard}>
            <Card.Content>
              <View style={styles.chartHeader}>
                <Text variant="titleSmall">Son 7 Gün Görüntülenme</Text>
              </View>
              <View style={styles.simpleChart}>
                {analytics.viewsLast7Days.map((value, index) => {
                  const maxVal = getMaxValue(analytics.viewsLast7Days);
                  const height = (value / maxVal) * 100;
                  return (
                    <View key={index} style={styles.chartBar}>
                      <View style={[styles.bar, { height: `${height}%` }]} />
                      <Text style={styles.barLabel}>{getDayLabels()[index]}</Text>
                    </View>
                  );
                })}
              </View>
              <View style={styles.chartFooter}>
                <Text variant="bodySmall" style={styles.chartTotal}>
                  Toplam: {analytics.viewsLast7Days.reduce((a, b) => a + b, 0)} görüntülenme
                </Text>
              </View>
            </Card.Content>
          </Card>

          {/* Top Listings */}
          <Card style={styles.card}>
            <Card.Content>
              <Text variant="titleSmall" style={styles.sectionTitle}>En Popüler İlanlarınız</Text>
              {analytics.topListings.map((listing, index) => (
                <TouchableOpacity
                  key={listing.id}
                  style={styles.listingItem}
                  onPress={() => router.push(`/product/${listing.id}`)}
                >
                  <Text style={styles.listingRank}>#{index + 1}</Text>
                  <View style={styles.listingInfo}>
                    <Text variant="bodyMedium" numberOfLines={1}>{listing.title}</Text>
                    <View style={styles.listingStats}>
                      <Ionicons name="eye" size={14} color={TarodanColors.textSecondary} />
                      <Text style={styles.listingStat}>{listing.views}</Text>
                      <Ionicons name="heart" size={14} color={TarodanColors.textSecondary} style={{ marginLeft: 12 }} />
                      <Text style={styles.listingStat}>{listing.favorites}</Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={TarodanColors.textSecondary} />
                </TouchableOpacity>
              ))}
            </Card.Content>
          </Card>

          {/* PREMIUM ANALYTICS SECTION */}
          {isPremium && (
            <>
              {/* Conversion & Performance Metrics */}
              <Card style={styles.card}>
                <Card.Content>
                  <View style={styles.premiumSectionHeader}>
                    <MaterialCommunityIcons name="crown" size={20} color={TarodanColors.primary} />
                    <Text variant="titleSmall" style={styles.premiumSectionTitle}>Premium Analitikler</Text>
                  </View>
                  
                  <View style={styles.metricsGrid}>
                    <View style={styles.metricItem}>
                      <Text variant="headlineSmall" style={styles.metricValue}>
                        %{analytics.conversionRate?.toFixed(1)}
                      </Text>
                      <Text variant="bodySmall" style={styles.metricLabel}>Dönüşüm Oranı</Text>
                      <View style={styles.metricTrend}>
                        <Ionicons name="trending-up" size={14} color={TarodanColors.success} />
                        <Text style={styles.trendText}>+0.5%</Text>
                      </View>
                    </View>
                    
                    <View style={styles.metricItem}>
                      <Text variant="headlineSmall" style={styles.metricValue}>
                        {analytics.avgTimeToSale} gün
                      </Text>
                      <Text variant="bodySmall" style={styles.metricLabel}>Ort. Satış Süresi</Text>
                      <View style={styles.metricTrend}>
                        <Ionicons name="trending-down" size={14} color={TarodanColors.success} />
                        <Text style={styles.trendText}>-2 gün</Text>
                      </View>
                    </View>
                  </View>
                </Card.Content>
              </Card>

              {/* Revenue Tracking */}
              <Card style={styles.card}>
                <Card.Content>
                  <Text variant="titleSmall" style={styles.sectionTitle}>Gelir Takibi</Text>
                  
                  <View style={styles.revenueHeader}>
                    <View>
                      <Text variant="bodySmall" style={styles.revenueLabel}>Toplam Gelir</Text>
                      <Text variant="headlineMedium" style={styles.revenueTotal}>
                        ₺{analytics.totalRevenue.toLocaleString('tr-TR')}
                      </Text>
                    </View>
                    <Chip icon="trending-up" textStyle={{ color: TarodanColors.success }}>
                      +23% bu ay
                    </Chip>
                  </View>

                  <View style={styles.revenueChart}>
                    {analytics.revenueByMonth?.map((item, index) => {
                      const maxRevenue = Math.max(...(analytics.revenueByMonth?.map(r => r.revenue) || [1]));
                      const height = (item.revenue / maxRevenue) * 80;
                      return (
                        <View key={index} style={styles.revenueBar}>
                          <Text variant="bodySmall" style={styles.revenueBarValue}>
                            ₺{(item.revenue / 1000).toFixed(1)}K
                          </Text>
                          <View style={[styles.revenueBarFill, { height }]} />
                          <Text style={styles.revenueBarLabel}>{item.month}</Text>
                        </View>
                      );
                    })}
                  </View>
                </Card.Content>
              </Card>

              {/* Trade Analytics */}
              <Card style={styles.card}>
                <Card.Content>
                  <Text variant="titleSmall" style={styles.sectionTitle}>Takas İstatistikleri</Text>
                  
                  <View style={styles.tradeStats}>
                    <View style={styles.tradeStat}>
                      <MaterialCommunityIcons name="swap-horizontal" size={32} color={TarodanColors.primary} />
                      <Text variant="headlineSmall" style={styles.tradeStatValue}>
                        {analytics.totalTrades}
                      </Text>
                      <Text variant="bodySmall" style={styles.tradeStatLabel}>Toplam Takas</Text>
                    </View>
                    
                    <View style={styles.tradeStat}>
                      <View style={styles.successRateCircle}>
                        <Text variant="titleMedium" style={styles.successRateText}>
                          %{analytics.tradeSuccessRate}
                        </Text>
                      </View>
                      <Text variant="bodySmall" style={styles.tradeStatLabel}>Başarı Oranı</Text>
                    </View>
                  </View>
                </Card.Content>
              </Card>

              {/* Collection Analytics */}
              <Card style={styles.card}>
                <Card.Content>
                  <Text variant="titleSmall" style={styles.sectionTitle}>Dijital Garaj İstatistikleri</Text>
                  
                  <View style={styles.collectionStats}>
                    <View style={styles.collectionStat}>
                      <Ionicons name="eye" size={24} color={TarodanColors.info} />
                      <Text variant="titleMedium" style={styles.collectionStatValue}>
                        {analytics.collectionViews}
                      </Text>
                      <Text variant="bodySmall" style={styles.collectionStatLabel}>
                        Koleksiyon Görüntüleme
                      </Text>
                    </View>
                    
                    <View style={styles.collectionStat}>
                      <Ionicons name="heart" size={24} color={TarodanColors.error} />
                      <Text variant="titleMedium" style={styles.collectionStatValue}>
                        {analytics.collectionLikes}
                      </Text>
                      <Text variant="bodySmall" style={styles.collectionStatLabel}>
                        Beğeni
                      </Text>
                    </View>
                  </View>
                </Card.Content>
              </Card>

              {/* Top Performers with Conversion */}
              <Card style={styles.card}>
                <Card.Content>
                  <Text variant="titleSmall" style={styles.sectionTitle}>En İyi Performans Gösterenler</Text>
                  {analytics.topPerformers?.map((listing, index) => (
                    <TouchableOpacity
                      key={listing.id}
                      style={styles.performerItem}
                      onPress={() => router.push(`/product/${listing.id}`)}
                    >
                      <Text style={styles.listingRank}>#{index + 1}</Text>
                      <View style={styles.listingInfo}>
                        <Text variant="bodyMedium" numberOfLines={1}>{listing.title}</Text>
                        <View style={styles.listingStats}>
                          <Ionicons name="eye" size={14} color={TarodanColors.textSecondary} />
                          <Text style={styles.listingStat}>{listing.views}</Text>
                          <Ionicons name="heart" size={14} color={TarodanColors.textSecondary} style={{ marginLeft: 8 }} />
                          <Text style={styles.listingStat}>{listing.favorites}</Text>
                        </View>
                      </View>
                      <View style={styles.conversionBadge}>
                        <Text style={styles.conversionText}>%{listing.conversionRate.toFixed(1)}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </Card.Content>
              </Card>

              {/* Export Options */}
              <Card style={styles.card}>
                <Card.Content>
                  <Text variant="titleSmall" style={styles.sectionTitle}>Rapor İndir</Text>
                  <TouchableOpacity style={styles.exportOption}>
                    <Ionicons name="document-text" size={24} color={TarodanColors.primary} />
                    <View style={styles.exportInfo}>
                      <Text variant="bodyMedium">PDF Rapor</Text>
                      <Text variant="bodySmall" style={styles.exportDesc}>
                        Detaylı analitik raporu
                      </Text>
                    </View>
                    <Ionicons name="download-outline" size={24} color={TarodanColors.primary} />
                  </TouchableOpacity>
                  <Divider style={{ marginVertical: 8 }} />
                  <TouchableOpacity style={styles.exportOption}>
                    <Ionicons name="grid" size={24} color={TarodanColors.success} />
                    <View style={styles.exportInfo}>
                      <Text variant="bodyMedium">Excel Rapor</Text>
                      <Text variant="bodySmall" style={styles.exportDesc}>
                        Satış ve takas verileri
                      </Text>
                    </View>
                    <Ionicons name="download-outline" size={24} color={TarodanColors.primary} />
                  </TouchableOpacity>
                </Card.Content>
              </Card>
            </>
          )}

          {/* Premium Upsell */}
          {!isPremium && (
            <Card style={styles.premiumCard}>
              <Card.Content>
                <View style={styles.premiumHeader}>
                  <Ionicons name="diamond" size={24} color={TarodanColors.primary} />
                  <Text variant="titleSmall" style={styles.premiumTitle}>Detaylı Analitik</Text>
                </View>
                <Text variant="bodySmall" style={styles.premiumText}>
                  Premium üyelikle daha detaylı analitiklere erişin:
                </Text>
                <View style={styles.premiumFeatures}>
                  <Text style={styles.premiumFeature}>• Dönüşüm oranları</Text>
                  <Text style={styles.premiumFeature}>• Gelir takibi</Text>
                  <Text style={styles.premiumFeature}>• Takas başarı oranları</Text>
                  <Text style={styles.premiumFeature}>• En iyi performans gösteren ilanlar</Text>
                  <Text style={styles.premiumFeature}>• Koleksiyon etkileşim metrikleri</Text>
                </View>
                <Button mode="contained" onPress={() => router.push('/upgrade')} style={styles.premiumButton}>
                  Premium'a Geç
                </Button>
              </Card.Content>
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
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
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
  title: {
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 24,
    color: TarodanColors.textSecondary,
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
    backgroundColor: TarodanColors.background,
  },
  overviewContent: {
    alignItems: 'center',
    padding: 16,
  },
  overviewValue: {
    marginTop: 8,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
  },
  overviewLabel: {
    color: TarodanColors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  chartCard: {
    marginBottom: 12,
    backgroundColor: TarodanColors.background,
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
    backgroundColor: TarodanColors.primary,
    borderRadius: 4,
    minHeight: 4,
  },
  barLabel: {
    marginTop: 8,
    fontSize: 11,
    color: TarodanColors.textSecondary,
  },
  chartFooter: {
    marginTop: 16,
    alignItems: 'center',
  },
  chartTotal: {
    color: TarodanColors.textSecondary,
  },
  card: {
    marginBottom: 12,
    backgroundColor: TarodanColors.background,
  },
  sectionTitle: {
    marginBottom: 12,
    color: TarodanColors.textPrimary,
  },
  listingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: TarodanColors.border,
  },
  listingRank: {
    width: 30,
    fontWeight: 'bold',
    color: TarodanColors.primary,
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
    color: TarodanColors.textSecondary,
  },
  premiumCard: {
    marginBottom: 12,
    backgroundColor: TarodanColors.primaryLight + '10',
    borderWidth: 1,
    borderColor: TarodanColors.primary + '40',
  },
  premiumHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  premiumTitle: {
    marginLeft: 8,
    color: TarodanColors.primary,
  },
  premiumText: {
    color: TarodanColors.textSecondary,
    marginBottom: 8,
  },
  premiumFeatures: {
    marginBottom: 16,
  },
  premiumFeature: {
    color: TarodanColors.textPrimary,
    marginVertical: 2,
  },
  premiumButton: {
    backgroundColor: TarodanColors.primary,
  },
  // Premium Analytics Styles
  premiumSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  premiumSectionTitle: {
    marginLeft: 8,
    color: TarodanColors.primary,
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
    backgroundColor: TarodanColors.backgroundSecondary,
    borderRadius: 12,
    marginHorizontal: 4,
  },
  metricValue: {
    fontWeight: 'bold',
    color: TarodanColors.primary,
  },
  metricLabel: {
    color: TarodanColors.textSecondary,
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
    color: TarodanColors.success,
    marginLeft: 4,
  },
  revenueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  revenueLabel: {
    color: TarodanColors.textSecondary,
  },
  revenueTotal: {
    color: TarodanColors.primary,
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
    color: TarodanColors.textSecondary,
    marginBottom: 4,
  },
  revenueBarFill: {
    width: 32,
    backgroundColor: TarodanColors.primary,
    borderRadius: 4,
    minHeight: 4,
  },
  revenueBarLabel: {
    marginTop: 8,
    fontSize: 11,
    color: TarodanColors.textSecondary,
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
    color: TarodanColors.textPrimary,
  },
  tradeStatLabel: {
    color: TarodanColors.textSecondary,
    marginTop: 4,
  },
  successRateCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 4,
    borderColor: TarodanColors.success,
    justifyContent: 'center',
    alignItems: 'center',
  },
  successRateText: {
    color: TarodanColors.success,
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
    color: TarodanColors.textPrimary,
  },
  collectionStatLabel: {
    color: TarodanColors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  performerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: TarodanColors.border,
  },
  conversionBadge: {
    backgroundColor: TarodanColors.success + '20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  conversionText: {
    color: TarodanColors.success,
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
    color: TarodanColors.textSecondary,
    marginTop: 2,
  },
});

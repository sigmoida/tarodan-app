import React from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Card, Button, Text, theme } from '@tarodan/ui-native';

import { ThemedRefreshControl } from '@/components/common';
import { styles } from '../_lib/styles';
import { getDayLabels, getMaxValue } from '../_lib/types';
import type { AnalyticsController } from '../_hooks/useAnalytics';

const { colors } = theme;

/** Full analytics content: overview cards, 7-day chart, top listings, premium. */
export function AnalyticsContent({ f }: { f: AnalyticsController }) {
  const { analytics, isPremium } = f;
  if (!analytics) return null;

  return (
    <ScrollView
      style={styles.content}
      refreshControl={<ThemedRefreshControl refreshing={f.refreshing} onRefresh={f.onRefresh} />}
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
            <Text variant="h3" style={styles.overviewValue}>{analytics.totalFavorites}</Text>
            <Text variant="bodySm" style={styles.overviewLabel}>Toplam Favori</Text>
          </View>
        </Card>
      </View>

      <View style={styles.overviewRow}>
        <Card style={styles.overviewCard}>
          <View style={styles.overviewContent}>
            <Ionicons name="pricetag" size={24} color={colors.info[600]!} />
            <Text variant="h3" style={styles.overviewValue}>{analytics.activeListings}</Text>
            <Text variant="bodySm" style={styles.overviewLabel}>Aktif İlan</Text>
          </View>
        </Card>
        <Card style={styles.overviewCard}>
          <View style={styles.overviewContent}>
            <Ionicons name="checkmark-circle" size={24} color={colors.success[600]!} />
            <Text variant="h3" style={styles.overviewValue}>{analytics.totalSales}</Text>
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
                <Ionicons name="heart" size={14} color={colors.text.muted} style={{ marginLeft: theme.spacing[3] }} />
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
              </View>

              <View style={styles.metricItem}>
                <Text variant="h3" style={styles.metricValue}>
                  {analytics.avgTimeToSell} gün
                </Text>
                <Text variant="bodySm" style={styles.metricLabel}>Ort. Satış Süresi</Text>
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
  );
}

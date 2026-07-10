import React from 'react';
import { View, Image, Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Card, theme } from '@tarodan/ui-native';

import { resolveImageUrl } from '../../../../src/utils/imageUrl';
import { styles } from '../_lib/styles';
import type { TabType } from '../_lib/types';
import { StatCard, ProductRow, CollectionRow } from './BusinessRows';
import type { BusinessController } from '../_hooks/useBusinessStats';

const { colors } = theme;

const TABS: Array<{ id: TabType; label: string; icon: string }> = [
  { id: 'overview', label: 'Genel Bakış', icon: 'stats-chart' },
  { id: 'products', label: 'Ürünler', icon: 'cube' },
  { id: 'collections', label: 'Koleksiyonlar', icon: 'albums' },
];

// ---------------------------------------------------------------------------
// Company header (gradient)
// ---------------------------------------------------------------------------
export function BusinessCompanyHeader({ f }: { f: BusinessController }) {
  const { stats } = f;
  return (
    <LinearGradient colors={[colors.primary[100]!, colors.warning[100]!]} style={styles.companyHeader}>
      <View style={styles.companyInfo}>
        {stats?.company.avatarUrl ? (
          <Image source={{ uri: resolveImageUrl(stats.company.avatarUrl) }} style={styles.companyAvatar} />
        ) : (
          <View style={styles.companyAvatarPlaceholder}>
            <Text style={styles.companyAvatarText}>🏢</Text>
          </View>
        )}
        <View style={styles.companyDetails}>
          <View style={styles.companyNameRow}>
            <Text style={styles.companyName}>
              {stats?.company.name || stats?.company.displayName}
            </Text>
            {stats?.company.isVerified && (
              <Ionicons name="checkmark-circle" size={20} color={colors.success[600]!} />
            )}
          </View>
          <Text style={styles.companyTitle}>📊 İşletme Paneli</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------
export function BusinessTabs({ f }: { f: BusinessController }) {
  return (
    <View style={styles.tabsContainer}>
      {TABS.map((tab) => (
        <Pressable
          key={tab.id}
          style={[styles.tab, f.activeTab === tab.id && styles.tabActive]}
          onPress={() => f.setActiveTab(tab.id)}
        >
          <Ionicons name={tab.icon as any} size={18} color={f.activeTab === tab.id ? colors.primary[600]! : colors.text.muted} />
          <Text style={[styles.tabText, f.activeTab === tab.id && styles.tabTextActive]}>
            {tab.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Tab content (overview / products / collections)
// ---------------------------------------------------------------------------
export function BusinessTabContent({ f }: { f: BusinessController }) {
  const { activeTab, stats } = f;
  if (!stats) return null;

  if (activeTab === 'overview') {
    return (
      <View style={styles.tabContent}>
        {/* Main Stats */}
        <View style={styles.statsGrid}>
          <StatCard icon="eye" label="Görüntülenme" value={stats.overview.totalViews} color={colors.info[600]!} />
          <StatCard icon="heart" label="Beğeni" value={stats.overview.totalLikes} color={colors.danger[600]!} />
          <StatCard icon="bag-handle" label="Satış" value={stats.overview.totalSales} color={colors.success[600]!} />
          <StatCard icon="cube" label="Aktif Ürün" value={stats.overview.activeProducts} color={colors.info[700]!} />
          <StatCard icon="albums" label="Koleksiyon" value={stats.overview.totalCollections} color={colors.primary[600]!} />
        </View>

        {/* Revenue Card */}
        <Card style={styles.revenueCard} padding={0}>
          <LinearGradient colors={[colors.success[100]!, colors.success[50]!]} style={styles.revenueGradient}>
            <Text style={styles.revenueLabel}>Toplam Gelir</Text>
            <Text style={styles.revenueValue}>₺{stats.overview.totalRevenue.toLocaleString('tr-TR')}</Text>
          </LinearGradient>
        </Card>

        {/* Weekly Stats */}
        <Card style={styles.weeklyCard}>
          <Text style={styles.sectionTitle}>Bu Hafta</Text>
          <View style={styles.weeklyStatsRow}>
            <View style={styles.weeklyStat}>
              <Ionicons name="eye" size={20} color={colors.info[600]!} />
              <Text style={styles.weeklyStatValue}>{stats.weekly.views.toLocaleString()}</Text>
              <Text style={styles.weeklyStatLabel}>Görüntülenme</Text>
            </View>
            <View style={styles.weeklyStat}>
              <Ionicons name="heart" size={20} color={colors.danger[600]!} />
              <Text style={styles.weeklyStatValue}>{stats.weekly.likes.toLocaleString()}</Text>
              <Text style={styles.weeklyStatLabel}>Beğeni</Text>
            </View>
          </View>
        </Card>

        {/* Collection Stats */}
        <Card style={styles.collectionStatsCard}>
          <Text style={styles.sectionTitle}>Koleksiyon İstatistikleri</Text>
          <View style={styles.weeklyStatsRow}>
            <View style={styles.weeklyStat}>
              <Text style={[styles.weeklyStatValue, { color: colors.info[600]! }]}>
                {stats.overview.collectionViews.toLocaleString()}
              </Text>
              <Text style={styles.weeklyStatLabel}>Toplam Görüntülenme</Text>
            </View>
            <View style={styles.weeklyStat}>
              <Text style={[styles.weeklyStatValue, { color: colors.danger[600]! }]}>
                {stats.overview.collectionLikes.toLocaleString()}
              </Text>
              <Text style={styles.weeklyStatLabel}>Toplam Beğeni</Text>
            </View>
          </View>
        </Card>
      </View>
    );
  }

  if (activeTab === 'products') {
    return (
      <View style={styles.tabContent}>
        <Text style={styles.sectionTitle}>En Çok Görüntülenen Ürünler</Text>
        {stats.topProducts?.byViews?.length > 0 ? (
          stats.topProducts.byViews.map((product, index) => (
            <ProductRow key={product.id} product={product} index={index} metric="views" />
          ))
        ) : (
          <Text style={styles.emptyText}>Henüz ürün istatistiği yok</Text>
        )}

        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>En Çok Beğenilen Ürünler</Text>
        {stats.topProducts?.byLikes?.length > 0 ? (
          stats.topProducts.byLikes.map((product, index) => (
            <ProductRow key={product.id} product={product} index={index} metric="likes" />
          ))
        ) : (
          <Text style={styles.emptyText}>Henüz ürün istatistiği yok</Text>
        )}
      </View>
    );
  }

  // collections
  return (
    <View style={styles.tabContent}>
      <Text style={styles.sectionTitle}>En Popüler Koleksiyonlar</Text>
      {stats.topCollections?.length > 0 ? (
        stats.topCollections.map((collection, index) => (
          <CollectionRow key={collection.id} collection={collection} index={index} />
        ))
      ) : (
        <Text style={styles.emptyText}>Henüz koleksiyon istatistiği yok</Text>
      )}
    </View>
  );
}

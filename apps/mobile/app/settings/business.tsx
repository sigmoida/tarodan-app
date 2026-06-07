import { View, ScrollView, StyleSheet, Pressable, Image } from 'react-native';
import {
  Card,
  Spinner,
  Button,
  Text,
  theme,
} from '@tarodan/ui-native';
import { useState, useEffect } from 'react';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';
import { useTranslation } from '../../src/i18n';
import { resolveImageUrl } from '../../src/utils/imageUrl';

const { colors, spacing, radius } = theme;

interface ProductStats {
  id: string;
  title: string;
  viewCount: number;
  likeCount: number;
  price: number;
  image?: string;
}

interface CollectionStats {
  id: string;
  name: string;
  viewCount: number;
  likeCount: number;
  coverImage?: string;
  itemCount: number;
}

interface BusinessStats {
  overview: {
    totalProducts: number;
    activeProducts: number;
    totalViews: number;
    totalLikes: number;
    totalSales: number;
    totalRevenue: number;
    totalCollections: number;
    collectionViews: number;
    collectionLikes: number;
  };
  weekly: {
    views: number;
    likes: number;
  };
  topProducts: {
    byViews: ProductStats[];
    byLikes: ProductStats[];
  };
  topCollections: CollectionStats[];
  company: {
    name: string;
    displayName: string;
    avatarUrl?: string;
    isVerified: boolean;
  };
}

type TabType = 'overview' | 'products' | 'collections';

export default function BusinessDashboardScreen() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const [stats, setStats] = useState<BusinessStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/(auth)/login');
      return;
    }
    loadBusinessStats();
  }, [isAuthenticated]);

  const loadBusinessStats = async () => {
    try {
      const response = await api.get('/users/me/business-stats');
      setStats(response.data);
    } catch (err: any) {
      if (err.response?.status === 400) {
        const errorMessage = err.response?.data?.message || err.response?.data?.error || 'Bu özellik sadece İşletme hesapları için geçerlidir.';
        setError(errorMessage);
      } else {
        setError('İstatistikler yüklenirken bir hata oluştu');
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Spinner size="lg" />
        <Text style={styles.loadingText}>İstatistikler yükleniyor...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text.heading} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('mobile.settingsBusiness')}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="warning-outline" size={64} color={colors.danger[600]!} />
          <Text style={styles.errorText}>{error}</Text>
          {error.includes('şirket adı') || error.includes('companyName') ? (
            <Button
              variant="primary"
              title="Şirket Adı Ekle"
              onPress={() => router.push('/settings/edit-profile')}
            />
          ) : (
            <Button
              variant="primary"
              title="Üyeliğimi Yükselt"
              onPress={() => router.push('/pricing')}
            />
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text.heading} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('mobile.settingsBusiness')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Company Header */}
        <LinearGradient
          colors={[colors.primary[100]!, colors.warning[100]!]}
          style={styles.companyHeader}
        >
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

        {/* Tabs */}
        <View style={styles.tabsContainer}>
          {[
            { id: 'overview', label: 'Genel Bakış', icon: 'stats-chart' },
            { id: 'products', label: 'Ürünler', icon: 'cube' },
            { id: 'collections', label: 'Koleksiyonlar', icon: 'albums' },
          ].map((tab) => (
            <Pressable
              key={tab.id}
              style={[styles.tab, activeTab === tab.id && styles.tabActive]}
              onPress={() => setActiveTab(tab.id as TabType)}
            >
              <Ionicons
                name={tab.icon as any}
                size={18}
                color={activeTab === tab.id ? colors.primary[600]! : colors.text.muted}
              />
              <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Overview Tab */}
        {activeTab === 'overview' && stats && (
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
              <LinearGradient
                colors={[colors.success[100]!, colors.success[50]!]}
                style={styles.revenueGradient}
              >
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
        )}

        {/* Products Tab */}
        {activeTab === 'products' && stats && (
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
        )}

        {/* Collections Tab */}
        {activeTab === 'collections' && stats && (
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
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// Stat Card Component
function StatCard({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <Ionicons name={icon as any} size={24} color={color} />
      <Text style={styles.statValue}>{value.toLocaleString()}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// Product Row Component
function ProductRow({ product, index, metric }: { product: ProductStats; index: number; metric: 'views' | 'likes' }) {
  return (
    <Pressable
      style={styles.productRow}
      onPress={() => router.push(`/product/${product.id}`)}
    >
      <View style={styles.productRank}>
        <Text style={styles.productRankText}>{index + 1}</Text>
      </View>
      {product.image ? (
        <Image source={{ uri: resolveImageUrl(product.image) }} style={styles.productImage} />
      ) : (
        <View style={[styles.productImage, styles.productImagePlaceholder]}>
          <Text>📦</Text>
        </View>
      )}
      <View style={styles.productInfo}>
        <Text style={styles.productTitle} numberOfLines={1}>{product.title}</Text>
        <Text style={styles.productPrice}>₺{(product.price ?? 0).toLocaleString('tr-TR')}</Text>
      </View>
      <View style={styles.productStats}>
        <View style={styles.productStatItem}>
          <Ionicons name="eye" size={14} color={metric === 'views' ? colors.info[600]! : colors.text.muted} />
          <Text style={[styles.productStatText, metric === 'views' && { color: colors.info[600]! }]}>
            {(product.viewCount ?? 0).toLocaleString()}
          </Text>
        </View>
        <View style={styles.productStatItem}>
          <Ionicons name="heart" size={14} color={metric === 'likes' ? colors.danger[600]! : colors.text.muted} />
          <Text style={[styles.productStatText, metric === 'likes' && { color: colors.danger[600]! }]}>
            {(product.likeCount ?? 0).toLocaleString()}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

// Collection Row Component
function CollectionRow({ collection, index }: { collection: CollectionStats; index: number }) {
  return (
    <Pressable
      style={styles.productRow}
      onPress={() => router.push(`/collections/${collection.id}`)}
    >
      <View style={styles.productRank}>
        <Text style={styles.productRankText}>{index + 1}</Text>
      </View>
      {collection.coverImage ? (
        <Image source={{ uri: resolveImageUrl(collection.coverImage) }} style={styles.productImage} />
      ) : (
        <View style={[styles.productImage, styles.productImagePlaceholder]}>
          <Text>📚</Text>
        </View>
      )}
      <View style={styles.productInfo}>
        <Text style={styles.productTitle} numberOfLines={1}>{collection.name}</Text>
        <Text style={styles.productPrice}>{collection.itemCount} ürün</Text>
      </View>
      <View style={styles.productStats}>
        <View style={styles.productStatItem}>
          <Ionicons name="eye" size={14} color={colors.info[600]!} />
          <Text style={[styles.productStatText, { color: colors.info[600]! }]}>
            {collection.viewCount.toLocaleString()}
          </Text>
        </View>
        <View style={styles.productStatItem}>
          <Ionicons name="heart" size={14} color={colors.danger[600]!} />
          <Text style={[styles.productStatText, { color: colors.danger[600]! }]}>
            {collection.likeCount.toLocaleString()}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.DEFAULT,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface.DEFAULT,
  },
  loadingText: {
    marginTop: 12,
    color: colors.text.muted,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 16,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.heading,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    fontSize: 16,
    color: colors.danger[600]!,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  content: {
    flex: 1,
  },
  companyHeader: {
    padding: 16,
    margin: 16,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.primary[200]!,
  },
  companyInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  companyAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  companyAvatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary[100]!,
    justifyContent: 'center',
    alignItems: 'center',
  },
  companyAvatarText: {
    fontSize: 32,
  },
  companyDetails: {
    marginLeft: 16,
    flex: 1,
  },
  companyNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  companyName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.heading,
  },
  companyTitle: {
    fontSize: 14,
    color: colors.primary[600]!,
    marginTop: 4,
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary[600]!,
  },
  tabText: {
    fontSize: 12,
    color: colors.text.muted,
    fontWeight: '500',
  },
  tabTextActive: {
    color: colors.primary[600]!,
    fontWeight: 'bold',
  },
  tabContent: {
    padding: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    width: '47%',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 16,
    borderLeftWidth: 4,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 4,
  },
  revenueCard: {
    marginBottom: 16,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  revenueGradient: {
    padding: 20,
  },
  revenueLabel: {
    fontSize: 14,
    color: colors.success[700]!,
    fontWeight: '600',
  },
  revenueValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginTop: 4,
  },
  weeklyCard: {
    marginBottom: 16,
    borderRadius: radius.lg,
  },
  collectionStatsCard: {
    borderRadius: radius.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginBottom: 12,
  },
  weeklyStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 8,
  },
  weeklyStat: {
    alignItems: 'center',
  },
  weeklyStatValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginTop: 8,
  },
  weeklyStatLabel: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 4,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 12,
    marginBottom: 8,
  },
  productRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface.alt,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  productRankText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: colors.text.heading,
  },
  productImage: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    marginRight: 12,
  },
  productImagePlaceholder: {
    backgroundColor: colors.surface.alt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  productInfo: {
    flex: 1,
  },
  productTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.heading,
  },
  productPrice: {
    fontSize: 12,
    color: colors.primary[600]!,
    marginTop: 2,
  },
  productStats: {
    alignItems: 'flex-end',
  },
  productStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  productStatText: {
    fontSize: 12,
    color: colors.text.muted,
  },
  emptyText: {
    textAlign: 'center',
    color: colors.text.muted,
    paddingVertical: 24,
  },
});

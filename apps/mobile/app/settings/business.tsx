import { View, ScrollView, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Text, ActivityIndicator, Card } from 'react-native-paper';
import { useState, useEffect } from 'react';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../../src/services/api';
import { TarodanColors } from '../../src/theme';
import { useAuthStore } from '../../src/stores/authStore';

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
  const { isAuthenticated, user } = useAuthStore();
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
        <ActivityIndicator size="large" color={TarodanColors.primary} />
        <Text style={styles.loadingText}>İstatistikler yükleniyor...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={TarodanColors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>İşletme Paneli</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="warning-outline" size={64} color={TarodanColors.error} />
          <Text style={styles.errorText}>{error}</Text>
          {error.includes('şirket adı') || error.includes('companyName') ? (
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => router.push('/settings/edit-profile')}
            >
              <LinearGradient
                colors={[TarodanColors.primary, '#FFA500']}
                style={styles.actionButtonGradient}
              >
                <Text style={styles.actionButtonText}>Şirket Adı Ekle</Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => router.push('/pricing')}
            >
              <LinearGradient
                colors={[TarodanColors.primary, '#FFA500']}
                style={styles.actionButtonGradient}
              >
                <Text style={styles.actionButtonText}>Üyeliğimi Yükselt</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>İşletme Paneli</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Company Header */}
        <LinearGradient
          colors={['rgba(249,115,22,0.2)', 'rgba(251,191,36,0.2)']}
          style={styles.companyHeader}
        >
          <View style={styles.companyInfo}>
            {stats?.company.avatarUrl ? (
              <Image source={{ uri: stats.company.avatarUrl }} style={styles.companyAvatar} />
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
                  <Ionicons name="checkmark-circle" size={20} color={TarodanColors.success} />
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
            <TouchableOpacity
              key={tab.id}
              style={[styles.tab, activeTab === tab.id && styles.tabActive]}
              onPress={() => setActiveTab(tab.id as TabType)}
            >
              <Ionicons 
                name={tab.icon as any} 
                size={18} 
                color={activeTab === tab.id ? TarodanColors.primary : TarodanColors.textSecondary} 
              />
              <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Overview Tab */}
        {activeTab === 'overview' && stats && (
          <View style={styles.tabContent}>
            {/* Main Stats */}
            <View style={styles.statsGrid}>
              <StatCard icon="eye" label="Görüntülenme" value={stats.overview.totalViews} color="#3B82F6" />
              <StatCard icon="heart" label="Beğeni" value={stats.overview.totalLikes} color="#EF4444" />
              <StatCard icon="bag-handle" label="Satış" value={stats.overview.totalSales} color="#22C55E" />
              <StatCard icon="cube" label="Aktif Ürün" value={stats.overview.activeProducts} color="#8B5CF6" />
              <StatCard icon="albums" label="Koleksiyon" value={stats.overview.totalCollections} color="#F97316" />
            </View>

            {/* Revenue Card */}
            <Card style={styles.revenueCard}>
              <LinearGradient
                colors={['rgba(34,197,94,0.2)', 'rgba(16,185,129,0.2)']}
                style={styles.revenueGradient}
              >
                <Text style={styles.revenueLabel}>Toplam Gelir</Text>
                <Text style={styles.revenueValue}>₺{stats.overview.totalRevenue.toLocaleString('tr-TR')}</Text>
              </LinearGradient>
            </Card>

            {/* Weekly Stats */}
            <Card style={styles.weeklyCard}>
              <Card.Content>
                <Text style={styles.sectionTitle}>Bu Hafta</Text>
                <View style={styles.weeklyStatsRow}>
                  <View style={styles.weeklyStat}>
                    <Ionicons name="eye" size={20} color="#3B82F6" />
                    <Text style={styles.weeklyStatValue}>{stats.weekly.views.toLocaleString()}</Text>
                    <Text style={styles.weeklyStatLabel}>Görüntülenme</Text>
                  </View>
                  <View style={styles.weeklyStat}>
                    <Ionicons name="heart" size={20} color="#EF4444" />
                    <Text style={styles.weeklyStatValue}>{stats.weekly.likes.toLocaleString()}</Text>
                    <Text style={styles.weeklyStatLabel}>Beğeni</Text>
                  </View>
                </View>
              </Card.Content>
            </Card>

            {/* Collection Stats */}
            <Card style={styles.collectionStatsCard}>
              <Card.Content>
                <Text style={styles.sectionTitle}>Koleksiyon İstatistikleri</Text>
                <View style={styles.weeklyStatsRow}>
                  <View style={styles.weeklyStat}>
                    <Text style={[styles.weeklyStatValue, { color: '#3B82F6' }]}>
                      {stats.overview.collectionViews.toLocaleString()}
                    </Text>
                    <Text style={styles.weeklyStatLabel}>Toplam Görüntülenme</Text>
                  </View>
                  <View style={styles.weeklyStat}>
                    <Text style={[styles.weeklyStatValue, { color: '#EF4444' }]}>
                      {stats.overview.collectionLikes.toLocaleString()}
                    </Text>
                    <Text style={styles.weeklyStatLabel}>Toplam Beğeni</Text>
                  </View>
                </View>
              </Card.Content>
            </Card>
          </View>
        )}

        {/* Products Tab */}
        {activeTab === 'products' && stats && (
          <View style={styles.tabContent}>
            <Text style={styles.sectionTitle}>En Çok Görüntülenen Ürünler</Text>
            {stats.topProducts.byViews.length > 0 ? (
              stats.topProducts.byViews.map((product, index) => (
                <ProductRow key={product.id} product={product} index={index} metric="views" />
              ))
            ) : (
              <Text style={styles.emptyText}>Henüz ürün istatistiği yok</Text>
            )}

            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>En Çok Beğenilen Ürünler</Text>
            {stats.topProducts.byLikes.length > 0 ? (
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
            {stats.topCollections.length > 0 ? (
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
    <TouchableOpacity 
      style={styles.productRow}
      onPress={() => router.push(`/product/${product.id}`)}
    >
      <View style={styles.productRank}>
        <Text style={styles.productRankText}>{index + 1}</Text>
      </View>
      {product.image ? (
        <Image source={{ uri: product.image }} style={styles.productImage} />
      ) : (
        <View style={[styles.productImage, styles.productImagePlaceholder]}>
          <Text>📦</Text>
        </View>
      )}
      <View style={styles.productInfo}>
        <Text style={styles.productTitle} numberOfLines={1}>{product.title}</Text>
        <Text style={styles.productPrice}>₺{product.price.toLocaleString('tr-TR')}</Text>
      </View>
      <View style={styles.productStats}>
        <View style={styles.productStatItem}>
          <Ionicons name="eye" size={14} color={metric === 'views' ? '#3B82F6' : TarodanColors.textSecondary} />
          <Text style={[styles.productStatText, metric === 'views' && { color: '#3B82F6' }]}>
            {product.viewCount.toLocaleString()}
          </Text>
        </View>
        <View style={styles.productStatItem}>
          <Ionicons name="heart" size={14} color={metric === 'likes' ? '#EF4444' : TarodanColors.textSecondary} />
          <Text style={[styles.productStatText, metric === 'likes' && { color: '#EF4444' }]}>
            {product.likeCount.toLocaleString()}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// Collection Row Component
function CollectionRow({ collection, index }: { collection: CollectionStats; index: number }) {
  return (
    <TouchableOpacity 
      style={styles.productRow}
      onPress={() => router.push(`/collections/${collection.id}`)}
    >
      <View style={styles.productRank}>
        <Text style={styles.productRankText}>{index + 1}</Text>
      </View>
      {collection.coverImage ? (
        <Image source={{ uri: collection.coverImage }} style={styles.productImage} />
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
          <Ionicons name="eye" size={14} color="#3B82F6" />
          <Text style={[styles.productStatText, { color: '#3B82F6' }]}>
            {collection.viewCount.toLocaleString()}
          </Text>
        </View>
        <View style={styles.productStatItem}>
          <Ionicons name="heart" size={14} color="#EF4444" />
          <Text style={[styles.productStatText, { color: '#EF4444' }]}>
            {collection.likeCount.toLocaleString()}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
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
    backgroundColor: TarodanColors.background,
  },
  loadingText: {
    marginTop: 12,
    color: TarodanColors.textSecondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 16,
    backgroundColor: TarodanColors.surface,
    borderBottomWidth: 1,
    borderBottomColor: TarodanColors.border,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    fontSize: 16,
    color: TarodanColors.error,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  actionButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  actionButtonGradient: {
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  content: {
    flex: 1,
  },
  companyHeader: {
    padding: 16,
    margin: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TarodanColors.primary + '30',
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
    backgroundColor: TarodanColors.primary + '30',
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
    color: TarodanColors.textPrimary,
  },
  companyTitle: {
    fontSize: 14,
    color: TarodanColors.primary,
    marginTop: 4,
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: TarodanColors.border,
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
    borderBottomColor: TarodanColors.primary,
  },
  tabText: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    fontWeight: '500',
  },
  tabTextActive: {
    color: TarodanColors.primary,
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
    backgroundColor: TarodanColors.surface,
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    marginTop: 4,
  },
  revenueCard: {
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  revenueGradient: {
    padding: 20,
  },
  revenueLabel: {
    fontSize: 14,
    color: TarodanColors.success,
    fontWeight: '600',
  },
  revenueValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    marginTop: 4,
  },
  weeklyCard: {
    marginBottom: 16,
    borderRadius: 12,
  },
  collectionStatsCard: {
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
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
    color: TarodanColors.textPrimary,
    marginTop: 8,
  },
  weeklyStatLabel: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    marginTop: 4,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TarodanColors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  productRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: TarodanColors.surfaceVariant,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  productRankText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
  },
  productImage: {
    width: 48,
    height: 48,
    borderRadius: 8,
    marginRight: 12,
  },
  productImagePlaceholder: {
    backgroundColor: TarodanColors.surfaceVariant,
    justifyContent: 'center',
    alignItems: 'center',
  },
  productInfo: {
    flex: 1,
  },
  productTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
  },
  productPrice: {
    fontSize: 12,
    color: TarodanColors.primary,
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
    color: TarodanColors.textSecondary,
  },
  emptyText: {
    textAlign: 'center',
    color: TarodanColors.textSecondary,
    paddingVertical: 24,
  },
});

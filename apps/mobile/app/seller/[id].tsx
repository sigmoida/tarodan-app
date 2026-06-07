import { useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Dimensions, Image, Pressable } from 'react-native';
import { Avatar, Button, Card, Spinner, Text, theme } from '@tarodan/ui-native';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { userApi, productsApi, ratingsApi } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';
import { resolveImageUrl } from '../../src/utils/imageUrl';

const { colors } = theme;

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;

const BADGE_INFO: Record<string, { label: string; icon: string; color: string }> = {
  fast_shipper: { label: 'Hızlı Kargo', icon: 'rocket-outline', color: colors.info[600]! },
  trusted_seller: { label: 'Güvenilir', icon: 'shield-checkmark', color: colors.success[600]! },
  responsive: { label: 'Hızlı Yanıt', icon: 'chatbubble-outline', color: colors.info[600]! },
  elite_collector: { label: 'Elit Koleksiyoner', icon: 'diamond-outline', color: colors.warning[500]! },
  hall_of_fame: { label: 'Onur Listesi', icon: 'trophy-outline', color: colors.warning[500]! },
};

export default function SellerProfileScreen() {
  const { id } = useLocalSearchParams();
  const { isAuthenticated } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'listings' | 'reviews'>('listings');

  const { data: apiSeller, isLoading } = useQuery({
    queryKey: ['seller', id],
    queryFn: async () => {
      try {
        // Web `userApi.getPublicProfile` ile aynı: GET /users/:id/profile
        const response = await userApi.getPublicProfile(String(id));
        return (response.data as any)?.data || response.data;
      } catch (error) {
        console.log('⚠️ Satıcı bilgisi yüklenemedi, mock data kullanılacak');
        return null;
      }
    },
    retry: 1,
  });

  const { data: sellerProducts } = useQuery({
    queryKey: ['seller-products', id],
    queryFn: async () => {
      try {
        const response = await productsApi.getAll({ sellerId: id });
        const data: any = response.data;
        return data?.data ?? data?.items ?? data ?? [];
      } catch {
        return [];
      }
    },
    enabled: !!id,
  });

  // Web `apps/web/src/app/seller/[id]/page.tsx:181-193` paritesi
  const { data: ratingStats } = useQuery({
    queryKey: ['seller-rating-stats', id],
    queryFn: async () => {
      try {
        const response = await ratingsApi.getUserStats(String(id));
        return (response.data as any)?.data ?? response.data ?? null;
      } catch {
        return null;
      }
    },
    enabled: !!id,
  });

  const { data: ratingList } = useQuery({
    queryKey: ['seller-ratings', id],
    queryFn: async () => {
      try {
        const response = await ratingsApi.getUserRatings(String(id), { limit: 20 });
        const data: any = response.data;
        return data?.items ?? data?.data ?? data ?? [];
      } catch {
        return [];
      }
    },
    enabled: !!id,
  });

  const seller = apiSeller;
  const products = Array.isArray(sellerProducts) ? sellerProducts : [];
  // Backend ratings (web ile parite); yoksa boş.
  const reviews = Array.isArray(ratingList) ? ratingList : [];

  const handleMessage = () => {
    if (!isAuthenticated) {
      router.push('/(auth)/login');
      return;
    }
    router.push(`/messages/new?sellerId=${id}`);
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Spinner size="lg" />
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      </View>
    );
  }

  if (!seller) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="person-outline" size={64} color={colors.text.muted} />
        <Text style={styles.loadingText}>Satıcı bulunamadı</Text>
        <Button
          variant="primary"
          title="Geri Dön"
          onPress={() => router.back()}
          style={{ marginTop: 16 }}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Satıcı Profili</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <Avatar
            size="xl"
            name={seller.displayName?.substring(0, 2).toUpperCase() || 'S'}
          />
          <View style={styles.profileNameRow}>
            <Text style={styles.profileName}>{seller.displayName}</Text>
            {seller.isVerified && (
              <Ionicons name="checkmark-circle" size={24} color={colors.warning[500]!} />
            )}
          </View>
          {seller.location && (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={16} color={colors.text.muted} />
              <Text style={styles.locationText}>{seller.location}</Text>
            </View>
          )}
          {seller.createdAt ? (
            <Text style={styles.memberSince}>
              Üye: {new Date(seller.createdAt).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}
            </Text>
          ) : null}

          {/* Stats Row — web ile parite: stats objesinden */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{seller.stats?.totalListings ?? products.length}</Text>
              <Text style={styles.statLabel}>İlan</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{seller.stats?.totalSales ?? 0}</Text>
              <Text style={styles.statLabel}>Satış</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <View style={styles.ratingValue}>
                <Ionicons name="star" size={18} color={colors.warning[500]!} />
                <Text style={styles.statValue}>
                  {(ratingStats?.averageScore ?? ratingStats?.averageRating ?? seller.stats?.averageRating ?? 0).toFixed(1)}
                </Text>
              </View>
              <Text style={styles.statLabel}>
                {(ratingStats?.totalRatings ?? ratingStats?.total ?? seller.stats?.totalRatings ?? 0)} değerlendirme
              </Text>
            </View>
          </View>

          {/* Badges */}
          {seller.badges && seller.badges.length > 0 && (
            <View style={styles.badgesRow}>
              {seller.badges.map((badge: string) => {
                const info = BADGE_INFO[badge];
                if (!info) return null;
                return (
                  <View key={badge} style={[styles.badge, { backgroundColor: info.color }]}>
                    <Ionicons name={info.icon as any} size={14} color={colors.white} />
                    <Text style={styles.badgeText}>{info.label}</Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* Bio */}
          {seller.bio && (
            <Text style={styles.bio}>{seller.bio}</Text>
          )}

          {/* Message Button */}
          <Button
            variant="primary"
            title="Mesaj Gönder"
            onPress={handleMessage}
            style={styles.messageButton}
            icon="chatbubble-outline"
          />
          {!isAuthenticated && (
            <Text style={styles.loginNotice}>
              Mesaj göndermek için üye girişi yapın
            </Text>
          )}
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'listings' && styles.tabActive]}
            onPress={() => setActiveTab('listings')}
          >
            <Ionicons
              name="grid-outline"
              size={20}
              color={activeTab === 'listings' ? colors.primary[600]! : colors.text.muted}
            />
            <Text style={[styles.tabText, activeTab === 'listings' && styles.tabTextActive]}>
              İlanlar ({products.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'reviews' && styles.tabActive]}
            onPress={() => setActiveTab('reviews')}
          >
            <Ionicons
              name="star-outline"
              size={20}
              color={activeTab === 'reviews' ? colors.primary[600]! : colors.text.muted}
            />
            <Text style={[styles.tabText, activeTab === 'reviews' && styles.tabTextActive]}>
              Değerlendirmeler ({reviews.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tab Content */}
        {activeTab === 'listings' ? (
          products.length === 0 ? (
            <View style={{ alignItems: 'center', padding: 32 }}>
              <Ionicons name="cube-outline" size={48} color={colors.text.subtle} />
              <Text style={{ color: colors.text.muted, marginTop: 8, fontSize: 14 }}>
                Henüz ilan yok
              </Text>
            </View>
          ) : (
          <View style={styles.listingsGrid}>
            {products.map((product: any) => (
              <Pressable
                key={product.id}
                onPress={() => router.push(`/product/${product.id}`)}
                style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
              >
                <Card style={styles.productCard} padding={0}>
                  <Image
                    source={{ uri: resolveImageUrl(product.images) }}
                    style={styles.productImage}
                    resizeMode="cover"
                  />
                  {product.tradeAvailable && (
                    <View style={styles.tradeBadge}>
                      <Ionicons name="swap-horizontal" size={12} color={colors.white} />
                    </View>
                  )}
                  <View style={styles.productContent}>
                    <Text style={styles.productTitle} numberOfLines={2}>{product.title}</Text>
                    <Text style={styles.productPrice}>₺{product.price?.toLocaleString('tr-TR')}</Text>
                  </View>
                </Card>
              </Pressable>
            ))}
          </View>
          )
        ) : (
          <View style={styles.reviewsList}>
            {reviews.length === 0 ? (
              <View style={{ alignItems: 'center', padding: 32 }}>
                <Ionicons name="star-outline" size={48} color={colors.text.subtle} />
                <Text style={{ color: colors.text.muted, marginTop: 8, fontSize: 14 }}>
                  Henüz değerlendirme yok
                </Text>
              </View>
            ) : (
              reviews.map((review: any) => {
                // Backend rating: { score, comment, createdAt, reviewer: { displayName, avatarUrl } }
                // Mock: { rating, comment, date, userName }
                const score = review.score ?? review.rating ?? 0;
                const reviewerName =
                  review.reviewer?.displayName ?? review.userName ?? 'Kullanıcı';
                const dateStr = review.createdAt ?? review.date;
                const avatarUrl = review.reviewer?.avatarUrl;
                return (
                  <View key={review.id} style={styles.reviewCard}>
                    <View style={styles.reviewHeader}>
                      <Avatar
                        size="md"
                        source={avatarUrl}
                        name={reviewerName.substring(0, 2).toUpperCase()}
                      />
                      <View style={styles.reviewInfo}>
                        <Text style={styles.reviewerName}>{reviewerName}</Text>
                        <View style={styles.ratingStars}>
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Ionicons
                              key={star}
                              name={star <= score ? 'star' : 'star-outline'}
                              size={14}
                              color={colors.warning[500]!}
                            />
                          ))}
                          {dateStr ? (
                            <Text style={styles.reviewDate}>
                              {new Date(dateStr).toLocaleDateString('tr-TR')}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    </View>
                    {review.comment ? (
                      <Text style={styles.reviewComment}>{review.comment}</Text>
                    ) : null}
                  </View>
                );
              })
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface.DEFAULT,
  },
  loadingText: {
    marginTop: 16,
    color: colors.text.muted,
  },
  header: {
    backgroundColor: colors.primary[600]!,
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
    color: colors.white,
  },
  content: {
    flex: 1,
  },
  profileCard: {
    backgroundColor: colors.surface.DEFAULT,
    padding: 24,
    alignItems: 'center',
  },
  profileNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    gap: 8,
  },
  profileName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.heading,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  locationText: {
    fontSize: 14,
    color: colors.text.muted,
  },
  memberSince: {
    fontSize: 13,
    color: colors.text.muted,
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border.DEFAULT,
    width: '100%',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.border.DEFAULT,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.heading,
  },
  statLabel: {
    fontSize: 13,
    color: colors.text.muted,
    marginTop: 4,
  },
  ratingValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 16,
    gap: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.white,
  },
  responseInfo: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 24,
  },
  responseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  responseText: {
    fontSize: 13,
    color: colors.text.muted,
  },
  bio: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.text.heading,
    textAlign: 'center',
    marginTop: 16,
    paddingHorizontal: 20,
  },
  messageButton: {
    marginTop: 20,
    width: '100%',
    borderRadius: 12,
  },
  loginNotice: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 8,
    fontStyle: 'italic',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.surface.DEFAULT,
    marginTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.primary[600]!,
  },
  tabText: {
    fontSize: 14,
    color: colors.text.muted,
  },
  tabTextActive: {
    color: colors.primary[600]!,
    fontWeight: '600',
  },
  listingsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 16,
  },
  productCard: {
    width: CARD_WIDTH,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.surface.DEFAULT,
  },
  productImage: {
    width: '100%',
    height: CARD_WIDTH,
  },
  tradeBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: colors.warning[500]!,
    padding: 6,
    borderRadius: 12,
  },
  productContent: {
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  productTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.heading,
    marginBottom: 4,
  },
  productPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.primary[600]!,
  },
  reviewsList: {
    padding: 16,
  },
  reviewCard: {
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  reviewHeader: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  reviewInfo: {
    flex: 1,
    marginLeft: 12,
  },
  reviewerName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.heading,
  },
  ratingStars: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 2,
  },
  reviewDate: {
    fontSize: 12,
    color: colors.text.muted,
    marginLeft: 8,
  },
  reviewComment: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.text.heading,
  },
});

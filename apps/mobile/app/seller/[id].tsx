import { useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, FlatList, Dimensions, Image } from 'react-native';
import { Text, Avatar, Button, Card, Chip, Divider, ActivityIndicator } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';
import { TarodanColors } from '../../src/theme';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;

// Mock seller for demo/offline mode
const MOCK_SELLER = {
  id: 's1',
  displayName: 'Premium Collector',
  bio: 'Koleksiyoner ve model araba tutkunu. 10 yıldır diecast modellerle ilgileniyorum. Özellikle 1:18 ölçekli premium markalar konusunda uzmanım.',
  avatarUrl: null,
  rating: 4.8,
  totalReviews: 89,
  totalSales: 127,
  totalListings: 34,
  memberSince: '2023-01-15',
  responseTime: '< 1 saat',
  responseRate: 98,
  verified: true,
  badges: ['fast_shipper', 'trusted_seller', 'responsive'],
  location: 'İstanbul',
  products: [
    { id: '1', title: 'Porsche 911 GT3 RS', price: 3200, images: ['https://placehold.co/200x200/f3f4f6/9ca3af?text=Porsche'], tradeAvailable: true },
    { id: '2', title: 'Ferrari 488 GTB', price: 2800, images: ['https://placehold.co/200x200/f3f4f6/9ca3af?text=Ferrari'], tradeAvailable: false },
    { id: '3', title: 'Lamborghini Aventador', price: 3500, images: ['https://placehold.co/200x200/f3f4f6/9ca3af?text=Lambo'], tradeAvailable: true },
    { id: '4', title: 'BMW M4 Competition', price: 1800, images: ['https://placehold.co/200x200/f3f4f6/9ca3af?text=BMW'], tradeAvailable: false },
  ],
  reviews: [
    { id: 'r1', userName: 'Ahmet K.', rating: 5, comment: 'Harika satıcı, hızlı kargo.', date: '2024-01-10' },
    { id: 'r2', userName: 'Mehmet Y.', rating: 5, comment: 'Çok dikkatli paketleme, teşekkürler!', date: '2024-01-08' },
    { id: 'r3', userName: 'Ali V.', rating: 4, comment: 'Ürün açıklamaya uygun, güvenilir satıcı.', date: '2024-01-05' },
  ],
};

const BADGE_INFO: Record<string, { label: string; icon: string; color: string }> = {
  fast_shipper: { label: 'Hızlı Kargo', icon: 'rocket-outline', color: '#9C27B0' },
  trusted_seller: { label: 'Güvenilir', icon: 'shield-checkmark', color: '#4CAF50' },
  responsive: { label: 'Hızlı Yanıt', icon: 'chatbubble-outline', color: '#2196F3' },
  elite_collector: { label: 'Elit Koleksiyoner', icon: 'diamond-outline', color: '#FF9800' },
  hall_of_fame: { label: 'Onur Listesi', icon: 'trophy-outline', color: '#FFD700' },
};

export default function SellerProfileScreen() {
  const { id } = useLocalSearchParams();
  const { isAuthenticated } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'listings' | 'reviews'>('listings');

  const { data: apiSeller, isLoading } = useQuery({
    queryKey: ['seller', id],
    queryFn: async () => {
      try {
        const response = await api.get(`/users/${id}/public`);
        return response.data.data || response.data;
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
        const response = await api.get('/products', { params: { sellerId: id } });
        return response.data.data || response.data || [];
      } catch {
        return MOCK_SELLER.products;
      }
    },
    enabled: !!id,
  });

  const seller = apiSeller || MOCK_SELLER;
  const products = sellerProducts || MOCK_SELLER.products;
  const reviews = seller.reviews || MOCK_SELLER.reviews;

  const handleMessage = () => {
    if (!isAuthenticated) {
      router.push('/(auth)/login');
      return;
    }
    router.push(`/messages/new?sellerId=${id}`);
  };

  if (isLoading && !seller) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={TarodanColors.primary} />
        <Text style={styles.loadingText}>Yükleniyor...</Text>
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
        <Text style={styles.headerTitle}>Satıcı Profili</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <Avatar.Text
            size={80}
            label={seller.displayName?.substring(0, 2).toUpperCase() || 'S'}
            style={{ backgroundColor: TarodanColors.primary }}
          />
          <View style={styles.profileNameRow}>
            <Text style={styles.profileName}>{seller.displayName}</Text>
            {seller.verified && (
              <Ionicons name="checkmark-circle" size={24} color={TarodanColors.accent} />
            )}
          </View>
          {seller.location && (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={16} color={TarodanColors.textSecondary} />
              <Text style={styles.locationText}>{seller.location}</Text>
            </View>
          )}
          <Text style={styles.memberSince}>
            Üye: {new Date(seller.memberSince).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}
          </Text>

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{seller.totalListings}</Text>
              <Text style={styles.statLabel}>İlan</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{seller.totalSales}</Text>
              <Text style={styles.statLabel}>Satış</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <View style={styles.ratingValue}>
                <Ionicons name="star" size={18} color={TarodanColors.star} />
                <Text style={styles.statValue}>{seller.rating}</Text>
              </View>
              <Text style={styles.statLabel}>{seller.totalReviews} değerlendirme</Text>
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
                    <Ionicons name={info.icon as any} size={14} color="#fff" />
                    <Text style={styles.badgeText}>{info.label}</Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* Response Info */}
          <View style={styles.responseInfo}>
            <View style={styles.responseItem}>
              <Ionicons name="time-outline" size={20} color={TarodanColors.textSecondary} />
              <Text style={styles.responseText}>Yanıt süresi: {seller.responseTime}</Text>
            </View>
            <View style={styles.responseItem}>
              <Ionicons name="chatbubbles-outline" size={20} color={TarodanColors.textSecondary} />
              <Text style={styles.responseText}>Yanıt oranı: %{seller.responseRate}</Text>
            </View>
          </View>

          {/* Bio */}
          {seller.bio && (
            <Text style={styles.bio}>{seller.bio}</Text>
          )}

          {/* Message Button */}
          <Button
            mode="contained"
            buttonColor={TarodanColors.primary}
            onPress={handleMessage}
            style={styles.messageButton}
            icon="message-text-outline"
          >
            Mesaj Gönder
          </Button>
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
              color={activeTab === 'listings' ? TarodanColors.primary : TarodanColors.textSecondary} 
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
              color={activeTab === 'reviews' ? TarodanColors.primary : TarodanColors.textSecondary} 
            />
            <Text style={[styles.tabText, activeTab === 'reviews' && styles.tabTextActive]}>
              Değerlendirmeler ({reviews.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tab Content */}
        {activeTab === 'listings' ? (
          <View style={styles.listingsGrid}>
            {products.map((product: any) => (
              <Card
                key={product.id}
                style={styles.productCard}
                onPress={() => router.push(`/product/${product.id}`)}
              >
                <Card.Cover
                  source={{ uri: product.images?.[0] || 'https://placehold.co/200x200/f3f4f6/9ca3af?text=Ürün' }}
                  style={styles.productImage}
                />
                {product.tradeAvailable && (
                  <View style={styles.tradeBadge}>
                    <Ionicons name="swap-horizontal" size={12} color="#fff" />
                  </View>
                )}
                <Card.Content style={styles.productContent}>
                  <Text style={styles.productTitle} numberOfLines={2}>{product.title}</Text>
                  <Text style={styles.productPrice}>₺{product.price?.toLocaleString('tr-TR')}</Text>
                </Card.Content>
              </Card>
            ))}
          </View>
        ) : (
          <View style={styles.reviewsList}>
            {reviews.map((review: any) => (
              <View key={review.id} style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
                  <Avatar.Text
                    size={40}
                    label={review.userName?.substring(0, 2).toUpperCase() || 'U'}
                    style={{ backgroundColor: TarodanColors.secondaryLight }}
                  />
                  <View style={styles.reviewInfo}>
                    <Text style={styles.reviewerName}>{review.userName}</Text>
                    <View style={styles.ratingStars}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Ionicons
                          key={star}
                          name={star <= review.rating ? 'star' : 'star-outline'}
                          size={14}
                          color={TarodanColors.star}
                        />
                      ))}
                      <Text style={styles.reviewDate}>
                        {new Date(review.date).toLocaleDateString('tr-TR')}
                      </Text>
                    </View>
                  </View>
                </View>
                <Text style={styles.reviewComment}>{review.comment}</Text>
              </View>
            ))}
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
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: TarodanColors.background,
  },
  loadingText: {
    marginTop: 16,
    color: TarodanColors.textSecondary,
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
  content: {
    flex: 1,
  },
  profileCard: {
    backgroundColor: TarodanColors.background,
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
    color: TarodanColors.textPrimary,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  locationText: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
  },
  memberSince: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: TarodanColors.border,
    width: '100%',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: TarodanColors.border,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
  },
  statLabel: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
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
    color: '#fff',
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
    color: TarodanColors.textSecondary,
  },
  bio: {
    fontSize: 14,
    lineHeight: 20,
    color: TarodanColors.textPrimary,
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
    color: TarodanColors.textSecondary,
    marginTop: 8,
    fontStyle: 'italic',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: TarodanColors.background,
    marginTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: TarodanColors.border,
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
    borderBottomColor: TarodanColors.primary,
  },
  tabText: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
  },
  tabTextActive: {
    color: TarodanColors.primary,
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
    backgroundColor: TarodanColors.background,
  },
  productImage: {
    height: CARD_WIDTH,
  },
  tradeBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: TarodanColors.accent,
    padding: 6,
    borderRadius: 12,
  },
  productContent: {
    paddingVertical: 10,
  },
  productTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: TarodanColors.textPrimary,
    marginBottom: 4,
  },
  productPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: TarodanColors.primary,
  },
  reviewsList: {
    padding: 16,
  },
  reviewCard: {
    backgroundColor: TarodanColors.background,
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
    color: TarodanColors.textPrimary,
  },
  ratingStars: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 2,
  },
  reviewDate: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    marginLeft: 8,
  },
  reviewComment: {
    fontSize: 14,
    lineHeight: 20,
    color: TarodanColors.textPrimary,
  },
});

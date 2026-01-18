import { View, ScrollView, RefreshControl, Dimensions, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Text, Card, Chip, Searchbar, ActivityIndicator, useTheme, Avatar, Badge, IconButton } from 'react-native-paper';
import { useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../../src/services/api';
import { TarodanColors, SCALES, BRANDS } from '../../src/theme';
import { useAuthStore } from '../../src/stores/authStore';
import { useGuestStore } from '../../src/stores/guestStore';
import { SignupPrompt } from '../../src/components/SignupPrompt';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;

export default function HomeScreen() {
  const theme = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [apiConnected, setApiConnected] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [promptType, setPromptType] = useState<'favorites' | 'message' | 'purchase' | null>(null);
  
  const { isAuthenticated } = useAuthStore();
  const { incrementListingView, getPromptType, setLastPromptShown, canShowPrompt } = useGuestStore();

  // Check API connection
  useEffect(() => {
    api.get('/health').then(() => {
      setApiConnected(true);
      console.log('✅ API bağlantısı başarılı');
    }).catch((err) => {
      console.log('⚠️ API bağlantısı yok, mock data kullanılacak:', err.message);
      setApiConnected(false);
    });
  }, []);

  // Check for signup prompt (only for guests)
  useEffect(() => {
    if (!isAuthenticated) {
      const type = getPromptType();
      if (type && canShowPrompt()) {
        // Delay showing prompt
        const timer = setTimeout(() => {
          setPromptType(type);
          setShowPrompt(true);
          setLastPromptShown(type);
        }, 3000);
        return () => clearTimeout(timer);
      }
    }
  }, [isAuthenticated, getPromptType, canShowPrompt, setLastPromptShown]);

  // Fetch products - web ile aynı endpoint
  const { data: productsResponse, isLoading: loadingProducts, refetch: refetchProducts } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      try {
        const response = await api.get('/products', { params: { limit: 20 } });
        // Web ile aynı response yapısını destekle
        const products = response.data.data || response.data.products || response.data || [];
        console.log('📦 Ürünler yüklendi:', Array.isArray(products) ? products.length : 0);
        return Array.isArray(products) ? products : [];
      } catch (error) {
        console.log('⚠️ Ürünler yüklenemedi:', error);
        return [];
      }
    },
  });

  // Fetch categories - web ile aynı endpoint
  const { data: categoriesResponse } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      try {
        const response = await api.get('/categories');
        const cats = response.data.data || response.data || [];
        console.log('📂 Kategoriler yüklendi:', Array.isArray(cats) ? cats.length : 0);
        return Array.isArray(cats) ? cats : [];
      } catch (error) {
        console.log('⚠️ Kategoriler yüklenemedi:', error);
        return [];
      }
    },
  });

  // Fetch collections - web ile aynı endpoint
  const { data: collectionsResponse } = useQuery({
    queryKey: ['collections', 'browse'],
    queryFn: async () => {
      try {
        const response = await api.get('/collections/browse', { params: { limit: 5 } });
        const collections = response.data.data || response.data || [];
        return Array.isArray(collections) ? collections : [];
      } catch (error) {
        console.log('⚠️ Koleksiyonlar yüklenemedi');
        return [];
      }
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetchProducts();
    setRefreshing(false);
  }, [refetchProducts]);

  const handleSearch = () => {
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  const handleScalePress = (scale: string) => {
    router.push(`/search?scale=${scale}`);
  };

  const handleBrandPress = (brandId: string) => {
    router.push(`/search?brand=${brandId}`);
  };

  const handleCategoryPress = (categoryId: string) => {
    router.push(`/search?categoryId=${categoryId}`);
  };

  const handleProductPress = (productId: string) => {
    if (!isAuthenticated) {
      incrementListingView();
    }
    router.push(`/product/${productId}`);
  };

  // API'den gelen ürünleri kullan, yoksa mock data
  const products = productsResponse && productsResponse.length > 0 ? productsResponse : [];
  const categories = categoriesResponse && categoriesResponse.length > 0 ? categoriesResponse : [];
  const collections = collectionsResponse || [];
  
  // Loading durumu
  const isLoading = loadingProducts;

  const renderProductCard = (item: any, index: number) => {
    // API response field isimleri: images, isTradeEnabled/trade_available, viewCount, favoriteCount
    const imageUrl = item.images?.[0] || item.image || 'https://placehold.co/200x150/f3f4f6/9ca3af?text=Ürün';
    const isTradeEnabled = item.isTradeEnabled || item.trade_available;
    const viewCount = item.viewCount || item.views || 0;
    
    return (
      <Card
        key={item.id || index}
        style={styles.productCard}
        onPress={() => handleProductPress(item.id)}
      >
        <View style={styles.productImageContainer}>
          <Card.Cover
            source={{ uri: imageUrl }}
            style={styles.productImage}
          />
          {isTradeEnabled && (
            <View style={[styles.badge, { backgroundColor: TarodanColors.success }]}>
              <Ionicons name="swap-horizontal" size={10} color="#fff" />
              <Text style={styles.badgeText}> Takas</Text>
            </View>
          )}
          <View style={styles.likesContainer}>
            <Ionicons name="eye-outline" size={14} color={TarodanColors.textSecondary} />
            <Text style={styles.likesText}>{viewCount}</Text>
          </View>
        </View>
        <Card.Content style={styles.productContent}>
          <Text style={styles.productTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.productMeta}>{item.brand || 'Marka'} • {item.scale || '1:64'}</Text>
          <Text style={styles.productPrice}>₺{item.price?.toLocaleString('tr-TR') || 0}</Text>
        </Card.Content>
      </Card>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: TarodanColors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.logo}>TARO<Text style={styles.logoAccent}>DAN</Text></Text>
          <View style={styles.headerActions}>
            <IconButton
              icon="account-outline"
              iconColor={TarodanColors.textOnPrimary}
              size={24}
              onPress={() => router.push('/profile')}
            />
            <IconButton
              icon="cart-outline"
              iconColor={TarodanColors.textOnPrimary}
              size={24}
              onPress={() => router.push('/cart')}
            />
          </View>
        </View>
        <Searchbar
          placeholder="Kategori, ürün, marka, koleksiyon ara"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
          style={styles.searchBar}
          inputStyle={styles.searchInput}
          iconColor={TarodanColors.textSecondary}
        />
      </View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[TarodanColors.primary]} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Banner */}
        <View style={styles.heroBanner}>
          <LinearGradient
            colors={['#FFF5F0', '#FFE8E0']}
            style={styles.heroGradient}
          >
            <View style={styles.heroContent}>
              <View style={styles.heroText}>
                <Text style={styles.heroTitle}>Türkiye'nin en büyük</Text>
                <Text style={styles.heroSubtitle}>Diecast pazaryeri</Text>
                <Text style={styles.heroDescription}>
                  Diecast modelleri satın alın, satın ve takas edin. Dijital Garajınızı oluşturun ve koleksiyonunuzu sergileyin.
                </Text>
                <View style={styles.heroButtons}>
                  <TouchableOpacity style={styles.heroButtonPrimary} onPress={() => router.push('/profile')}>
                    <Text style={styles.heroButtonPrimaryText}>Koleksiyon oluştur</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.heroButtonSecondary} onPress={() => router.push('/search')}>
                    <Text style={styles.heroButtonSecondaryText}>Pazaryerini incele</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <Image
                source={{ uri: 'https://via.placeholder.com/150x100?text=Diecast+Cars' }}
                style={styles.heroImage}
                resizeMode="contain"
              />
            </View>
          </LinearGradient>
        </View>

        {/* Categories Section - API'den gelen kategoriler */}
        {categories.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleContainer}>
                <View style={styles.sectionIndicator} />
                <Text style={styles.sectionTitle}>Kategoriler</Text>
              </View>
              <TouchableOpacity onPress={() => router.push('/search')}>
                <Text style={styles.seeAllText}>Tümünü gör {'>'}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.brandsScroll}>
              {categories.slice(0, 8).map((cat: any) => (
                <TouchableOpacity
                  key={cat.id}
                  style={styles.brandItem}
                  onPress={() => handleCategoryPress(cat.id)}
                >
                  <View style={styles.brandLogo}>
                    <Text style={styles.brandLogoText}>{cat.name}</Text>
                    {cat.productCount > 0 && (
                      <Text style={styles.categoryCount}>{cat.productCount} ürün</Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Brands Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleContainer}>
              <View style={styles.sectionIndicator} />
              <Text style={styles.sectionTitle}>Markalar</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/search?showBrands=true')}>
              <Text style={styles.seeAllText}>Tümünü gör {'>'}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.brandsScroll}>
            {BRANDS.map((brand) => (
              <TouchableOpacity
                key={brand.id}
                style={styles.brandItem}
                onPress={() => handleBrandPress(brand.id)}
              >
                <View style={styles.brandLogo}>
                  <Text style={styles.brandLogoText}>{brand.name}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Scales Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleContainer}>
              <View style={styles.sectionIndicator} />
              <Text style={styles.sectionTitle}>Boyut</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/search?showScales=true')}>
              <Text style={styles.seeAllText}>Tümünü gör {'>'}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scalesScroll}>
            {SCALES.map((scale) => (
              <TouchableOpacity
                key={scale.id}
                style={styles.scaleChip}
                onPress={() => handleScalePress(scale.id)}
              >
                <Text style={styles.scaleChipText}>{scale.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Products Section - Öne Çıkanlar */}
        <View style={[styles.section, styles.bestSellersSection]}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleContainer}>
              <View style={styles.sectionIndicator} />
              <Text style={[styles.sectionTitle, { color: '#fff' }]}>Öne Çıkanlar</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/search')}>
              <Text style={[styles.seeAllText, { color: '#fff' }]}>Tümünü gör {'>'}</Text>
            </TouchableOpacity>
          </View>
          
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={styles.loadingText}>Ürünler yükleniyor...</Text>
            </View>
          ) : products.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="cube-outline" size={48} color="rgba(255,255,255,0.5)" />
              <Text style={styles.emptyText}>Henüz ürün yok</Text>
              <Text style={styles.emptySubtext}>API bağlantısını kontrol edin</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.productsScroll}>
              {products.slice(0, 10).map((item: any, index: number) => renderProductCard(item, index))}
            </ScrollView>
          )}
        </View>

        {/* All Products Grid */}
        {products.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleContainer}>
                <View style={styles.sectionIndicator} />
                <Text style={styles.sectionTitle}>Tüm İlanlar ({products.length})</Text>
              </View>
              <TouchableOpacity onPress={() => router.push('/search')}>
                <Text style={styles.seeAllText}>Tümünü gör {'>'}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.productsGrid}>
              {products.slice(0, 6).map((item: any, index: number) => (
                <View key={item.id || index} style={styles.gridItem}>
                  {renderProductCard(item, index)}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Collections Section */}
        {collections.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleContainer}>
                <View style={styles.sectionIndicator} />
                <Text style={styles.sectionTitle}>Koleksiyonlar</Text>
              </View>
              <TouchableOpacity onPress={() => router.push('/collections')}>
                <Text style={styles.seeAllText}>Tümünü gör {'>'}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.productsScroll}>
              {collections.map((collection: any) => (
                <TouchableOpacity 
                  key={collection.id} 
                  style={styles.collectionCard}
                  onPress={() => router.push(`/collection/${collection.id}`)}
                >
                  <Image 
                    source={{ uri: collection.coverImageUrl || 'https://placehold.co/200x150/f3f4f6/9ca3af?text=Koleksiyon' }} 
                    style={styles.collectionImage}
                  />
                  <View style={styles.collectionInfo}>
                    <Text style={styles.collectionName} numberOfLines={1}>{collection.name}</Text>
                    <Text style={styles.collectionMeta}>{collection.itemCount || 0} araç</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Footer Space */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Signup Prompt for Guests */}
      {promptType && (
        <SignupPrompt
          visible={showPrompt}
          onDismiss={() => setShowPrompt(false)}
          type={promptType}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    backgroundColor: TarodanColors.primary,
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  logo: {
    fontSize: 24,
    fontWeight: 'bold',
    color: TarodanColors.textOnPrimary,
  },
  logoAccent: {
    color: TarodanColors.secondary,
  },
  headerActions: {
    flexDirection: 'row',
  },
  searchBar: {
    backgroundColor: TarodanColors.background,
    borderRadius: 8,
    elevation: 0,
  },
  searchInput: {
    fontSize: 14,
  },
  scrollView: {
    flex: 1,
  },
  heroBanner: {
    margin: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  heroGradient: {
    padding: 20,
  },
  heroContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroText: {
    flex: 1,
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
  },
  heroSubtitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    marginBottom: 8,
  },
  heroDescription: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    marginBottom: 16,
    lineHeight: 18,
  },
  heroButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  heroButtonPrimary: {
    backgroundColor: TarodanColors.background,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TarodanColors.border,
  },
  heroButtonPrimaryText: {
    fontSize: 12,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
  },
  heroButtonSecondary: {
    backgroundColor: TarodanColors.background,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TarodanColors.border,
  },
  heroButtonSecondaryText: {
    fontSize: 12,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
  },
  heroImage: {
    width: 120,
    height: 80,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionIndicator: {
    width: 4,
    height: 20,
    backgroundColor: TarodanColors.primary,
    borderRadius: 2,
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
  },
  seeAllText: {
    fontSize: 14,
    color: TarodanColors.primary,
    fontWeight: '500',
  },
  brandsScroll: {
    paddingLeft: 16,
  },
  brandItem: {
    marginRight: 12,
  },
  brandLogo: {
    backgroundColor: TarodanColors.background,
    borderWidth: 1,
    borderColor: TarodanColors.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minWidth: 80,
    alignItems: 'center',
  },
  brandLogoText: {
    fontSize: 12,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
  },
  scalesScroll: {
    paddingLeft: 16,
  },
  scaleChip: {
    backgroundColor: TarodanColors.background,
    borderWidth: 1,
    borderColor: TarodanColors.primary,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
  },
  scaleChipText: {
    fontSize: 13,
    color: TarodanColors.primary,
    fontWeight: '500',
  },
  collectorCard: {
    backgroundColor: TarodanColors.background,
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: TarodanColors.border,
  },
  collectorInfo: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  collectorDetails: {
    flex: 1,
    marginLeft: 12,
  },
  collectorName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
  },
  collectorDesc: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    marginTop: 4,
  },
  collectorStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  collectorStatText: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    marginLeft: 4,
  },
  viewGarageButton: {
    marginTop: 8,
  },
  viewGarageButtonText: {
    fontSize: 13,
    color: TarodanColors.textPrimary,
    fontWeight: '500',
    borderWidth: 1,
    borderColor: TarodanColors.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  collectorProducts: {
    marginTop: 8,
  },
  bestSellersSection: {
    backgroundColor: TarodanColors.primary,
    paddingVertical: 16,
  },
  productsScroll: {
    paddingLeft: 16,
  },
  productCard: {
    width: CARD_WIDTH * 0.85,
    marginRight: 12,
    backgroundColor: TarodanColors.background,
    borderRadius: 12,
    overflow: 'hidden',
  },
  productImageContainer: {
    position: 'relative',
  },
  productImage: {
    height: 120,
    backgroundColor: TarodanColors.surfaceVariant,
  },
  badge: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: TarodanColors.textOnPrimary,
  },
  likesContainer: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  likesText: {
    fontSize: 11,
    color: TarodanColors.textSecondary,
    marginLeft: 4,
  },
  productContent: {
    padding: 10,
  },
  productTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: TarodanColors.primary,
    marginBottom: 4,
  },
  productMeta: {
    fontSize: 11,
    color: TarodanColors.textSecondary,
    marginBottom: 4,
  },
  productPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: TarodanColors.price,
  },
  companyCard: {
    backgroundColor: TarodanColors.background,
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: TarodanColors.border,
  },
  companyInfo: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  companyDetails: {
    flex: 1,
    marginLeft: 12,
  },
  companyName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
  },
  companyDesc: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    marginTop: 4,
  },
  companyMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 16,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingText: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    marginLeft: 4,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  verifiedText: {
    fontSize: 12,
    color: TarodanColors.info,
    marginLeft: 4,
  },
  companyProducts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  companyProductItem: {
    width: '48%',
    marginBottom: 12,
  },
  categoryCount: {
    fontSize: 10,
    color: TarodanColors.textSecondary,
    marginTop: 2,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.8)',
    marginTop: 12,
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.8)',
    marginTop: 12,
    fontSize: 16,
    fontWeight: '600',
  },
  emptySubtext: {
    color: 'rgba(255,255,255,0.5)',
    marginTop: 4,
    fontSize: 13,
  },
  productsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    justifyContent: 'space-between',
  },
  gridItem: {
    width: '48%',
    marginBottom: 12,
  },
  collectionCard: {
    width: 160,
    marginRight: 12,
    backgroundColor: TarodanColors.background,
    borderRadius: 12,
    overflow: 'hidden',
  },
  collectionImage: {
    width: '100%',
    height: 100,
    backgroundColor: TarodanColors.surfaceVariant,
  },
  collectionInfo: {
    padding: 10,
  },
  collectionName: {
    fontSize: 13,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
  },
  collectionMeta: {
    fontSize: 11,
    color: TarodanColors.textSecondary,
    marginTop: 2,
  },
});

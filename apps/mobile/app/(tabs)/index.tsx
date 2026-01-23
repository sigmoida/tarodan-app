import { View, ScrollView, RefreshControl, Dimensions, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Text, Card, Chip, Searchbar, ActivityIndicator, useTheme, Avatar, Badge, IconButton } from 'react-native-paper';
import { useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { api, productsApi, categoriesApi, collectionsApi } from '../../src/services/api';
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

  // Fetch products - web ile aynı endpoint: GET /products
  const { data: productsResponse, isLoading: loadingProducts, refetch: refetchProducts } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      try {
        const response = await productsApi.getAll({ limit: 20 });
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

  // Fetch categories - web ile aynı endpoint: GET /categories
  const { data: categoriesResponse } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      try {
        const response = await categoriesApi.getAll();
        const cats = response.data.data || response.data || [];
        console.log('📂 Kategoriler yüklendi:', Array.isArray(cats) ? cats.length : 0);
        return Array.isArray(cats) ? cats : [];
      } catch (error) {
        console.log('⚠️ Kategoriler yüklenemedi:', error);
        return [];
      }
    },
  });

  // Fetch collections - web ile aynı endpoint: GET /collections/browse
  const { data: collectionsResponse } = useQuery({
    queryKey: ['collections', 'browse'],
    queryFn: async () => {
      try {
        const response = await collectionsApi.browse({ limit: 5 });
        const collections = response.data.data || response.data || [];
        return Array.isArray(collections) ? collections : [];
      } catch (error) {
        console.log('⚠️ Koleksiyonlar yüklenemedi');
        return [];
      }
    },
  });

  // Fetch Featured Collector (Haftanın Koleksiyoneri) - web ile aynı
  const { data: featuredCollector } = useQuery({
    queryKey: ['featured-collector'],
    queryFn: async () => {
      try {
        const response = await collectionsApi.browse({ isPublic: true, page: 1, pageSize: 1 });
        const collections = response.data?.collections || response.data?.data || [];
        if (collections.length > 0) {
          const collectionId = collections[0].id;
          const detailResponse = await collectionsApi.getOne(collectionId);
          return detailResponse.data?.collection || detailResponse.data;
        }
        return null;
      } catch (error) {
        console.log('⚠️ Haftanın Koleksiyoneri yüklenemedi');
        return null;
      }
    },
  });

  // Fetch Company of Week (Haftanın Şirketi) - web ile aynı featured-business API
  const { data: companyOfWeek } = useQuery({
    queryKey: ['featured-business'],
    queryFn: async () => {
      try {
        // Web ile aynı endpoint: GET /users/featured-business
        const response = await api.get('/users/featured-business');
        if (response.data) {
          return response.data;
        }
        return null;
      } catch (error) {
        console.log('⚠️ Haftanın Şirketi yüklenemedi, fallback deneniyor');
        // Fallback: top-sellers
        try {
          const fallbackResponse = await api.get('/users/top-sellers?limit=1');
          const sellers = fallbackResponse.data?.data || fallbackResponse.data || [];
          if (sellers.length > 0) {
            const sellerId = sellers[0].id;
            const productsResponse = await productsApi.getAll({ sellerId, limit: 6 });
            const products = productsResponse.data?.data || productsResponse.data?.products || [];
            return {
              ...sellers[0],
              products: products.slice(0, 6),
              stats: {
                totalProducts: products.length,
                totalViews: 0,
                totalLikes: 0,
                totalSales: 0,
                averageRating: sellers[0].rating || 0,
                totalRatings: 0,
              },
            };
          }
        } catch {
          console.log('⚠️ Fallback da başarısız');
        }
        return null;
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
          <View style={styles.logoContainer}>
            <Image 
              source={require('../../assets/tarodan-logo.jpg')} 
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
          <View style={styles.headerActions}>
            <IconButton
              icon="folder-multiple-outline"
              iconColor={TarodanColors.textOnPrimary}
              size={24}
              onPress={() => router.push('/collections')}
            />
            <IconButton
              icon="heart-outline"
              iconColor={TarodanColors.textOnPrimary}
              size={24}
              onPress={() => router.push('/favorites')}
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

        {/* Haftanın Koleksiyoneri Section */}
        {featuredCollector && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleContainer}>
                <View style={styles.sectionIndicator} />
                <Text style={styles.sectionTitle}>Haftanın Koleksiyoneri</Text>
              </View>
              <TouchableOpacity onPress={() => router.push('/collections')}>
                <Text style={styles.seeAllText}>Tümünü gör {'>'}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.featuredCard}>
              <View style={styles.featuredHeader}>
                <View style={styles.featuredAvatar}>
                  <Text style={styles.featuredAvatarText}>
                    {(featuredCollector.userName || 'K').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.featuredInfo}>
                  <Text style={styles.featuredName}>{featuredCollector.userName || 'Koleksiyoner'}</Text>
                  <Text style={styles.featuredDesc}>
                    {featuredCollector.description || `${featuredCollector.itemCount || 0} araçlık koleksiyon`}
                  </Text>
                  <View style={styles.featuredStats}>
                    <Ionicons name="thumbs-up" size={14} color={TarodanColors.primary} />
                    <Text style={styles.featuredStatText}>{featuredCollector.likeCount || 0}</Text>
                  </View>
                </View>
              </View>
              {featuredCollector.items && featuredCollector.items.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.featuredProducts}>
                  {featuredCollector.items.slice(0, 3).map((item: any) => (
                    <TouchableOpacity 
                      key={item.id} 
                      style={styles.featuredProductCard}
                      onPress={() => router.push(`/product/${item.productId}`)}
                    >
                      <Image
                        source={{ uri: item.productImage || 'https://placehold.co/150x150/f3f4f6/9ca3af?text=Ürün' }}
                        style={styles.featuredProductImage}
                      />
                      <Text style={styles.featuredProductTitle} numberOfLines={2}>{item.productTitle}</Text>
                      <Text style={styles.featuredProductPrice}>₺{item.productPrice?.toLocaleString('tr-TR')}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
              <TouchableOpacity 
                style={styles.viewGarageBtn}
                onPress={() => router.push(`/collection/${featuredCollector.id}`)}
              >
                <Text style={styles.viewGarageBtnText}>Garajını incele →</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

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

        {/* Haftanın Şirketi Section - Web ile aynı */}
        {companyOfWeek && (
          <View style={styles.companySection}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleContainer}>
                <View style={[styles.sectionIndicator, { backgroundColor: '#FFA500' }]} />
                <Text style={styles.sectionTitle}>Haftanın Şirketi</Text>
                <View style={styles.businessBadge}>
                  <Text style={styles.businessBadgeText}>👑 Business</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => router.push('/search')}>
                <Text style={styles.seeAllText}>Tümünü gör {'>'}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.companyCard}>
              {/* Company Profile */}
              <View style={styles.companyHeader}>
                {companyOfWeek.avatarUrl ? (
                  <Image
                    source={{ uri: companyOfWeek.avatarUrl }}
                    style={styles.companyAvatar}
                  />
                ) : (
                  <LinearGradient
                    colors={[TarodanColors.primary, '#FFA500']}
                    style={styles.companyAvatarGradient}
                  >
                    <Text style={styles.companyAvatarText}>
                      {(companyOfWeek.companyName || companyOfWeek.displayName || 'Ş').charAt(0).toUpperCase()}
                    </Text>
                  </LinearGradient>
                )}
                <View style={styles.companyInfo}>
                  <View style={styles.companyNameRow}>
                    <Text style={styles.companyNameText}>
                      {companyOfWeek.companyName || companyOfWeek.displayName || 'Şirket'}
                    </Text>
                    {companyOfWeek.isVerified && (
                      <Ionicons name="checkmark-circle" size={18} color={TarodanColors.success} />
                    )}
                  </View>
                  <Text style={styles.companyBio}>
                    {companyOfWeek.bio || 'Premium Diecast araçların alım ve satımı'}
                  </Text>
                </View>
              </View>

              {/* Company Stats - Web ile aynı */}
              {companyOfWeek.stats && (
                <View style={styles.companyStatsGrid}>
                  <View style={[styles.companyStat, { backgroundColor: '#FFF3E0' }]}>
                    <Text style={[styles.companyStatValue, { color: TarodanColors.primary }]}>
                      {companyOfWeek.stats.totalProducts || 0}
                    </Text>
                    <Text style={styles.companyStatLabel}>Ürün</Text>
                  </View>
                  <View style={[styles.companyStat, { backgroundColor: '#E8F5E9' }]}>
                    <Text style={[styles.companyStatValue, { color: TarodanColors.success }]}>
                      {companyOfWeek.stats.totalSales || 0}
                    </Text>
                    <Text style={styles.companyStatLabel}>Satış</Text>
                  </View>
                  <View style={[styles.companyStat, { backgroundColor: '#E3F2FD' }]}>
                    <Text style={[styles.companyStatValue, { color: TarodanColors.info }]}>
                      {(companyOfWeek.stats.totalViews || 0).toLocaleString()}
                    </Text>
                    <Text style={styles.companyStatLabel}>Görüntülenme</Text>
                  </View>
                  <View style={[styles.companyStat, { backgroundColor: '#FFEBEE' }]}>
                    <Text style={[styles.companyStatValue, { color: TarodanColors.error }]}>
                      {(companyOfWeek.stats.totalLikes || 0).toLocaleString()}
                    </Text>
                    <Text style={styles.companyStatLabel}>Beğeni</Text>
                  </View>
                </View>
              )}

              {/* Rating */}
              {companyOfWeek.stats?.averageRating > 0 && (
                <View style={styles.companyRating}>
                  <Ionicons name="star" size={18} color="#F59E0B" />
                  <Text style={styles.companyRatingValue}>{companyOfWeek.stats.averageRating.toFixed(1)}</Text>
                  <Text style={styles.companyRatingCount}>({companyOfWeek.stats.totalRatings || 0} yorum)</Text>
                </View>
              )}

              {/* Öne Çıkan Ürünler - Web ile aynı 6 ürün */}
              <Text style={styles.companySectionTitle}>Öne Çıkan Ürünler</Text>
              {companyOfWeek.products && companyOfWeek.products.length > 0 && (
                <View style={styles.companyProductsGrid}>
                  {companyOfWeek.products.slice(0, 6).map((product: any) => (
                    <TouchableOpacity 
                      key={product.id} 
                      style={styles.companyProductCard}
                      onPress={() => router.push(`/product/${product.id}`)}
                    >
                      <Image
                        source={{ uri: product.image || product.images?.[0] || 'https://placehold.co/150x150/f3f4f6/9ca3af?text=Ürün' }}
                        style={styles.companyProductImage}
                      />
                      <View style={styles.companyProductLikes}>
                        <Ionicons name="thumbs-up" size={12} color={TarodanColors.primary} />
                        <Text style={styles.companyProductLikesText}>{product.likeCount || 0}</Text>
                      </View>
                      <View style={styles.companyProductInfo}>
                        <Text style={styles.companyProductTitle} numberOfLines={2}>{product.title}</Text>
                        <Text style={styles.companyProductPrice}>₺{product.price?.toLocaleString('tr-TR')}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Koleksiyonlar - Web ile aynı */}
              {companyOfWeek.collections && companyOfWeek.collections.length > 0 && (
                <>
                  <Text style={styles.companySectionTitle}>Koleksiyonları</Text>
                  {companyOfWeek.collections.slice(0, 2).map((collection: any) => (
                    <TouchableOpacity 
                      key={collection.id} 
                      style={styles.companyCollectionCard}
                      onPress={() => router.push(`/collection/${collection.id}`)}
                    >
                      {collection.coverImageUrl ? (
                        <Image
                          source={{ uri: collection.coverImageUrl }}
                          style={styles.companyCollectionImage}
                        />
                      ) : (
                        <View style={styles.companyCollectionImagePlaceholder}>
                          <Text style={{ fontSize: 24 }}>📚</Text>
                        </View>
                      )}
                      <View style={styles.companyCollectionInfo}>
                        <Text style={styles.companyCollectionName}>{collection.name}</Text>
                        <Text style={styles.companyCollectionMeta}>{collection.itemCount} ürün</Text>
                        <View style={styles.companyCollectionStats}>
                          <Text style={styles.companyCollectionStatText}>{collection.viewCount} görüntülenme</Text>
                          <Text style={styles.companyCollectionStatTextRed}>{collection.likeCount} beğeni</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
                </>
              )}

              <TouchableOpacity 
                style={styles.viewStoreButton}
                onPress={() => router.push(`/seller/${companyOfWeek.id}`)}
              >
                <LinearGradient
                  colors={[TarodanColors.primary, '#FFA500']}
                  style={styles.viewStoreButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Text style={styles.viewStoreButtonText}>Mağazayı İncele</Text>
                </LinearGradient>
              </TouchableOpacity>
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
  featuredCard: {
    backgroundColor: TarodanColors.surfaceVariant,
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 16,
  },
  featuredHeader: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  featuredAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: TarodanColors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featuredAvatarText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  featuredInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  featuredName: {
    fontSize: 17,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
  },
  featuredDesc: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    marginTop: 2,
  },
  featuredStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  featuredStatText: {
    fontSize: 13,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
    marginLeft: 4,
  },
  featuredProducts: {
    marginBottom: 12,
  },
  featuredProductCard: {
    width: 130,
    marginRight: 12,
    backgroundColor: TarodanColors.surface,
    borderRadius: 12,
    overflow: 'hidden',
  },
  featuredProductImage: {
    width: '100%',
    height: 100,
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  featuredProductTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: TarodanColors.textPrimary,
    padding: 8,
    paddingBottom: 4,
  },
  featuredProductPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: TarodanColors.primary,
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  viewGarageBtn: {
    alignSelf: 'flex-start',
  },
  viewGarageBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: TarodanColors.primary,
  },
  companyMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 12,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
    marginLeft: 4,
  },
  verifiedBadgeSmall: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  verifiedBadgeSmallText: {
    fontSize: 12,
    color: TarodanColors.success,
    marginLeft: 4,
  },
  // Logo styles
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoImage: {
    width: 130,
    height: 42,
    marginRight: 4,
  },
  // Company Section styles - Web ile aynı
  companySection: {
    backgroundColor: '#FFF5F0',
    paddingVertical: 16,
    marginBottom: 24,
  },
  businessBadge: {
    backgroundColor: TarodanColors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  businessBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
  },
  companyCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#FFEDD5',
  },
  companyHeader: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  companyAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: '#FFEDD5',
  },
  companyAvatarGradient: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFEDD5',
  },
  companyAvatarText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  companyInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  companyNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  companyNameText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
  },
  companyBio: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    marginTop: 4,
  },
  companyStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  companyStat: {
    flex: 1,
    minWidth: '45%',
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
  },
  companyStatValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  companyStatLabel: {
    fontSize: 10,
    color: TarodanColors.textSecondary,
    marginTop: 2,
  },
  companyRating: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  companyRatingValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    marginLeft: 4,
  },
  companyRatingCount: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    marginLeft: 4,
  },
  companySectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    marginBottom: 12,
    marginTop: 8,
  },
  companyProductsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  companyProductCard: {
    width: '31%',
    backgroundColor: TarodanColors.surfaceVariant,
    borderRadius: 12,
    overflow: 'hidden',
  },
  companyProductImage: {
    width: '100%',
    height: 80,
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  companyProductLikes: {
    position: 'absolute',
    top: 4,
    left: 4,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  companyProductLikesText: {
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 2,
    color: TarodanColors.textPrimary,
  },
  companyProductInfo: {
    padding: 8,
  },
  companyProductTitle: {
    fontSize: 11,
    fontWeight: '500',
    color: TarodanColors.textPrimary,
    marginBottom: 4,
  },
  companyProductPrice: {
    fontSize: 13,
    fontWeight: 'bold',
    color: TarodanColors.primary,
  },
  companyCollectionCard: {
    flexDirection: 'row',
    backgroundColor: TarodanColors.surfaceVariant,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    alignItems: 'center',
  },
  companyCollectionImage: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  companyCollectionImagePlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: TarodanColors.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  companyCollectionInfo: {
    flex: 1,
    marginLeft: 12,
  },
  companyCollectionName: {
    fontSize: 14,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
  },
  companyCollectionMeta: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    marginTop: 2,
  },
  companyCollectionStats: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  companyCollectionStatText: {
    fontSize: 11,
    color: TarodanColors.info,
  },
  companyCollectionStatTextRed: {
    fontSize: 11,
    color: TarodanColors.error,
  },
  viewStoreButton: {
    marginTop: 16,
  },
  viewStoreButtonGradient: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  viewStoreButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
  },
});

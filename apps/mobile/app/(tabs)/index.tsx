import { View, ScrollView, RefreshControl, Dimensions, Image, TouchableOpacity, StyleSheet, Pressable } from 'react-native';
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Card, Input, Spinner, Text, theme } from '@tarodan/ui-native';
import { api, productsApi, categoriesApi, collectionsApi, notificationsApi } from '../../src/services/api';
import { SCALES, BRANDS } from '../../src/theme';
import { useAuthStore } from '../../src/stores/authStore';
import { useGuestStore } from '../../src/stores/guestStore';
import { useCartStore } from '../../src/stores/cartStore';
import { useFavoritesStore } from '../../src/stores/favoritesStore';
import { useMessagesStore } from '../../src/stores/messagesStore';
import { SignupPrompt } from '../../src/components/SignupPrompt';
import { getImageUrl as getImageUrlFromUtils } from '../../src/utils/imageUrl';
import { isProductOutOfStock } from '../../src/utils/productPrice';
import { OutOfStockOverlay } from '../../src/components/product';

const { colors, spacing, radius } = theme;

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;

export default function HomeScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [apiConnected, setApiConnected] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [promptType, setPromptType] = useState<'favorites' | 'message' | 'purchase' | null>(null);
  
  const { isAuthenticated } = useAuthStore();
  const { incrementListingView, getPromptType, setLastPromptShown, canShowPrompt } = useGuestStore();

  // Sepet/favori sayaçları — header rozetleri için (store değişince re-render).
  const cartItems = useCartStore((s) => s.items);
  const cartCount = cartItems.reduce((n, i) => n + i.quantity, 0);
  // Kart üstünde "Sepette" göstergesi için ürün id seti (sepet değişince güncellenir).
  const cartProductIds = useMemo(() => new Set(cartItems.map((i) => i.productId)), [cartItems]);
  const favCount = useFavoritesStore((s) => s.items.length);
  const fetchFavorites = useFavoritesStore((s) => s.fetchFavorites);
  // Okunmamış mesaj sayısı — header mesaj rozeti için (tab-bar ile aynı kaynak).
  const messageUnreadCount = useMessagesStore((s) => s.totalUnreadCount);
  const fetchMessageUnreadCount = useMessagesStore((s) => s.fetchUnreadCount);
  useEffect(() => {
    if (isAuthenticated) fetchFavorites();
  }, [isAuthenticated]);
  useEffect(() => {
    if (isAuthenticated) fetchMessageUnreadCount();
  }, [isAuthenticated, fetchMessageUnreadCount]);

  // Okunmamış bildirim sayısı — header zil rozeti için (profil ile aynı query key).
  const { data: unreadData } = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: async () => {
      try {
        const response = await notificationsApi.getUnreadCount();
        const body = response.data as { count?: number; data?: { count?: number } } | undefined;
        return body?.count ?? body?.data?.count ?? 0;
      } catch {
        return 0;
      }
    },
    enabled: isAuthenticated,
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  });
  const unreadCount = typeof unreadData === 'number' ? unreadData : 0;

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
        // İlk ürünün images field'ını debug için logla
        if (products[0]) {
          console.log('🖼️ İlk ürün images:', JSON.stringify(products[0].images));
        }
        return Array.isArray(products) ? products : [];
      } catch (error) {
        console.log('⚠️ Ürünler yüklenemedi:', error);
        return [];
      }
    },
  });

  // Öne çıkan (boost'lu) ürünler — web vitrini ile aynı: GET /products?boostedOnly=true
  const { data: boostedResponse } = useQuery({
    queryKey: ['products', 'boosted'],
    queryFn: async () => {
      try {
        const response = await productsApi.getAll({ boostedOnly: true, status: 'active', limit: 12 });
        const list = response.data?.data || response.data?.products || response.data || [];
        return Array.isArray(list) ? list : [];
      } catch {
        return [];
      }
    },
  });
  const boostedProducts: any[] = boostedResponse || [];

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
        // Web ile aynı endpoint: GET /users/featured-collector (skora göre seçilmiş gerçek
        // "haftanın koleksiyoneri"). Önceki browse({pageSize:1}) ilk rastgele public koleksiyonu
        // alıyordu — web ile sapıyordu.
        const response = await api.get('/users/featured-collector');
        return response.data ?? null;
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

  // Her navigasyona benzersiz token ekle: Ara sekmesi kalıcı bir tab olduğundan,
  // token değişimi ekrana "bu taze bir geçiş, filtreyi yeniden uygula" sinyali verir.
  const navToken = () => `&t=${Date.now()}`;

  const handleSearch = () => {
    if (searchQuery.trim()) {
      router.navigate(`/search?q=${encodeURIComponent(searchQuery)}${navToken()}`);
    }
  };

  const handleScalePress = (scale: string) => {
    router.navigate(`/search?scale=${encodeURIComponent(scale)}${navToken()}`);
  };

  // Anasayfa "Markalar" şeridi aslında üreticiler (Hot Wheels, Tamiya...) — web ile
  // aynı: manufacturer ismi ile filtrele (backend ismi case-insensitive eşler).
  const handleBrandPress = (brand: { id: string; name: string }) => {
    router.navigate(`/search?manufacturer=${encodeURIComponent(brand.name)}${navToken()}`);
  };

  const handleCategoryPress = (cat: { id: string; name: string }) => {
    router.navigate(
      `/search?categoryId=${encodeURIComponent(cat.id)}&category=${encodeURIComponent(cat.name)}${navToken()}`,
    );
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

  // Use utility function that transforms localhost URLs to network IP
  const getImageUrl = (images: any): string => {
    return getImageUrlFromUtils(images);
  };

  const renderProductCard = (item: any, index: number) => {
    // API response field isimleri: images, isTradeEnabled/trade_available, viewCount, favoriteCount
    const imageUrl = getImageUrl(item.images);
    const isTradeEnabled = item.isTradeEnabled || item.trade_available;
    const viewCount = item.viewCount || item.views || 0;
    // brand/scale backend'den {id,name,slug} obje veya string gelebilir — Text'e gömülmeden önce düzleştir.
    const brandLabel = typeof item.brand === 'object' && item.brand !== null
      ? (item.brand.name ?? '')
      : (item.brand ?? 'Marka');
    const scaleLabel = typeof item.scale === 'object' && item.scale !== null
      ? (item.scale.name ?? '')
      : (item.scale ?? '1:64');

    return (
      <Pressable
        key={item.id || index}
        onPress={() => handleProductPress(item.id)}
        style={({ pressed }) => [styles.productCardWrapper, { opacity: pressed ? 0.85 : 1 }]}
      >
        <Card style={styles.productCard} padding={0}>
          <View style={styles.productImageContainer}>
            <Image
              source={{ uri: imageUrl }}
              style={[styles.productImage, isProductOutOfStock(item) && { opacity: 0.45 }]}
              resizeMode="cover"
            />
            {isProductOutOfStock(item) && <OutOfStockOverlay />}
            {/* Sol üst: durum rozetleri — dikey stack, üst üste binmesin */}
            {(isTradeEnabled || item.isBoosted || item.boostedUntil) && (
              <View style={styles.topLeftStack}>
                {isTradeEnabled && (
                  <View style={[styles.badge, { backgroundColor: colors.success[500]! }]}>
                    <Ionicons name="swap-horizontal" size={10} color={colors.white} />
                    <Text variant="caption" tone="inverted" weight="bold">
                      {' '}Takas
                    </Text>
                  </View>
                )}
                {(item.isBoosted || item.boostedUntil) && (
                  <View style={[styles.badge, { backgroundColor: colors.warning[500]! }]}>
                    <Ionicons name="rocket" size={10} color={colors.white} />
                    <Text variant="caption" tone="inverted" weight="bold">
                      {' '}Sponsorlu
                    </Text>
                  </View>
                )}
              </View>
            )}
            <View style={styles.likesContainer}>
              <Ionicons name="eye-outline" size={14} color={colors.text.muted} />
              <Text variant="caption" tone="muted" style={{ marginLeft: 2 }}>
                {viewCount}
              </Text>
            </View>
            {cartProductIds.has(item.id) && (
              <View style={styles.inCartPill}>
                <Ionicons name="checkmark-circle" size={13} color={colors.white} />
                <Text variant="caption" tone="inverted" weight="bold" style={{ marginLeft: 4 }}>
                  Sepette
                </Text>
              </View>
            )}
          </View>
          <View style={styles.productContent}>
            <Text variant="bodySm" weight="semibold" numberOfLines={2}>
              {item.title}
            </Text>
            <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
              {brandLabel} • {scaleLabel}
            </Text>
            <Text variant="h3" tone="primary" style={{ marginTop: 4 }}>
              ₺{item.price?.toLocaleString('tr-TR') || 0}
            </Text>
          </View>
        </Card>
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface.DEFAULT }]}>
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
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() => router.push('/messages')}
            >
              <Ionicons name="chatbubbles-outline" size={24} color={colors.white} />
              {messageUnreadCount > 0 && (
                <View style={styles.headerBadge}>
                  <Text style={styles.headerBadgeText}>{messageUnreadCount > 99 ? '99+' : messageUnreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() => router.push('/notifications')}
            >
              <Ionicons name="notifications-outline" size={24} color={colors.white} />
              {unreadCount > 0 && (
                <View style={styles.headerBadge}>
                  <Text style={styles.headerBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() => router.push('/collections')}
            >
              <Ionicons name="albums-outline" size={24} color={colors.white} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() => router.push('/favorites')}
            >
              <Ionicons name="heart-outline" size={24} color={colors.white} />
              {favCount > 0 && (
                <View style={styles.headerBadge}>
                  <Text style={styles.headerBadgeText}>{favCount > 99 ? '99+' : favCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() => router.push('/cart')}
            >
              <Ionicons name="cart-outline" size={24} color={colors.white} />
              {cartCount > 0 && (
                <View style={styles.headerBadge}>
                  <Text style={styles.headerBadgeText}>{cartCount > 99 ? '99+' : cartCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>
        <Input
          placeholder="Kategori, ürün, marka, koleksiyon ara"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
          leftIconName="search"
          containerStyle={{ marginBottom: 0 }}
        />
      </View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary[600]!]} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Banner */}
        <View style={styles.heroBanner}>
          <LinearGradient
            colors={[colors.primary[50]!, colors.primary[100]!]}
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
              <TouchableOpacity onPress={() => router.navigate(`/search?reset=1${navToken()}`)}>
                <Text style={styles.seeAllText}>Tümünü gör {'>'}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.brandsScroll}>
              {categories.slice(0, 8).map((cat: any) => (
                <TouchableOpacity
                  key={cat.id}
                  style={styles.brandItem}
                  onPress={() => handleCategoryPress(cat)}
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
            <TouchableOpacity onPress={() => router.navigate(`/search?openFilter=1${navToken()}`)}>
              <Text style={styles.seeAllText}>Tümünü gör {'>'}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.brandsScroll}>
            {BRANDS.map((brand) => (
              <TouchableOpacity
                key={brand.id}
                style={styles.brandItem}
                onPress={() => handleBrandPress(brand)}
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
            <TouchableOpacity onPress={() => router.navigate(`/search?openFilter=1${navToken()}`)}>
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
                    {(featuredCollector.user?.displayName || featuredCollector.userName || 'K').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.featuredInfo}>
                  <Text style={styles.featuredName}>{featuredCollector.user?.displayName || featuredCollector.userName || 'Koleksiyoner'}</Text>
                  <Text style={styles.featuredDesc}>
                    {featuredCollector.description || `${featuredCollector.itemCount || 0} araçlık koleksiyon`}
                  </Text>
                  <View style={styles.featuredStats}>
                    <Ionicons name="thumbs-up" size={14} color={colors.primary[600]!} />
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
                        source={{ uri: getImageUrlFromUtils(item.productImage) }}
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
                onPress={() => router.push(`/collections/${featuredCollector.id}` as any)}
              >
                <Text style={styles.viewGarageBtnText}>Garajını incele →</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Sponsorlu Ürünler (boost'lu) — Tümünü Gör YOK */}
        {boostedProducts.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleContainer}>
                <View style={styles.sectionIndicator} />
                <Text style={styles.sectionTitle}>Sponsorlu Ürünler</Text>
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.productsScroll}>
              {boostedProducts.slice(0, 12).map((item: any, index: number) => renderProductCard(item, index))}
            </ScrollView>
          </View>
        )}

        {/* Products Section - Popüler İlanlar (web 'Popüler İlanlar' / bestSellers paritesi) */}
        <View style={[styles.section, styles.bestSellersSection]}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleContainer}>
              <View style={styles.sectionIndicator} />
              <Text style={[styles.sectionTitle, { color: colors.white }]}>Popüler İlanlar</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/search')}>
              <Text style={[styles.seeAllText, { color: colors.white }]}>Tümünü gör {'>'}</Text>
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <Spinner size="lg" color={colors.white} />
              <Text style={styles.loadingText}>Ürünler yükleniyor...</Text>
            </View>
          ) : products.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="cube-outline" size={48} color={colors.gray[300]} />
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
                <Text style={styles.sectionTitle}>Tüm İlanlar</Text>
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
                <View style={[styles.sectionIndicator, { backgroundColor: colors.warning[500]! }]} />
                <Text style={styles.sectionTitle}>Haftanın Şirketi</Text>
                <View style={styles.businessBadge}>
                  <Text style={styles.businessBadgeText}>👑 Business</Text>
                </View>
              </View>
            </View>
            <View style={styles.companyCard}>
              {/* Company Profile */}
              <View style={styles.companyHeader}>
                {companyOfWeek.avatarUrl ? (
                  <Image
                    source={{ uri: getImageUrlFromUtils(companyOfWeek.avatarUrl) }}
                    style={styles.companyAvatar}
                  />
                ) : (
                  <LinearGradient
                    colors={[colors.primary[600]!, colors.warning[500]!]}
                    style={styles.companyAvatarGradient}
                  >
                    <Text style={styles.companyAvatarText}>
                      {(companyOfWeek.displayName || companyOfWeek.companyName || 'Ş').charAt(0).toUpperCase()}
                    </Text>
                  </LinearGradient>
                )}
                <View style={styles.companyInfo}>
                  <View style={styles.companyNameRow}>
                    <Text style={styles.companyNameText}>
                      {companyOfWeek.displayName || companyOfWeek.companyName || 'Şirket'}
                    </Text>
                    {companyOfWeek.isVerified && (
                      <Ionicons name="checkmark-circle" size={18} color={colors.success[600]!} />
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
                  <View style={[styles.companyStat, { backgroundColor: colors.warning[50]! }]}>
                    <Text style={[styles.companyStatValue, { color: colors.primary[600]! }]}>
                      {companyOfWeek.stats.totalProducts || 0}
                    </Text>
                    <Text style={styles.companyStatLabel}>Ürün</Text>
                  </View>
                  <View style={[styles.companyStat, { backgroundColor: colors.success[50]! }]}>
                    <Text style={[styles.companyStatValue, { color: colors.success[600]! }]}>
                      {companyOfWeek.stats.totalSales || 0}
                    </Text>
                    <Text style={styles.companyStatLabel}>Satış</Text>
                  </View>
                  <View style={[styles.companyStat, { backgroundColor: colors.info[50]! }]}>
                    <Text style={[styles.companyStatValue, { color: colors.info[600]! }]}>
                      {(companyOfWeek.stats.totalViews || 0).toLocaleString()}
                    </Text>
                    <Text style={styles.companyStatLabel}>Görüntülenme</Text>
                  </View>
                  <View style={[styles.companyStat, { backgroundColor: colors.danger[50]! }]}>
                    <Text style={[styles.companyStatValue, { color: colors.danger[600]! }]}>
                      {(companyOfWeek.stats.totalLikes || 0).toLocaleString()}
                    </Text>
                    <Text style={styles.companyStatLabel}>Beğeni</Text>
                  </View>
                </View>
              )}

              {/* Rating */}
              {companyOfWeek.stats?.averageRating > 0 && (
                <View style={styles.companyRating}>
                  <Ionicons name="star" size={18} color={colors.warning[500]!} />
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
                        source={{ uri: getImageUrl(product.image ?? product.cardUrl ?? product.images) }}
                        style={styles.companyProductImage}
                        resizeMode="cover"
                      />
                      <View style={styles.companyProductLikes}>
                        <Ionicons name="thumbs-up" size={12} color={colors.primary[600]!} />
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
                      onPress={() => router.push(`/collections/${collection.id}` as any)}
                    >
                      {collection.coverImageUrl ? (
                        <Image
                          source={{ uri: getImageUrlFromUtils(collection.coverImageUrl) }}
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
                  colors={[colors.primary[600]!, colors.warning[500]!]}
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
                  onPress={() => router.push(`/collections/${collection.id}` as any)}
                >
                  <Image 
                    source={{ uri: getImageUrlFromUtils(collection.coverImageUrl) }}
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
    backgroundColor: colors.surface.DEFAULT,
  },
  header: {
    backgroundColor: colors.primary[600]!,
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  logo: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.white,
  },
  logoAccent: {
    color: colors.gray[200],
  },
  headerActions: {
    flexDirection: 'row',
    backgroundColor: colors.overlay.white20,
    borderRadius: 14,
    padding: 6,
    gap: 8,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.overlay.white10,
  },
  headerBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.primary[600]!,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 2,
    elevation: 3,
  },
  headerBadgeText: {
    color: colors.primary[700]!,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 14,
    textAlign: 'center',
  },
  inCartPill: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary[600]!,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  searchBar: {
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    elevation: 2,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  searchInput: {
    fontSize: 14,
    color: colors.text.heading,
  },
  scrollView: {
    flex: 1,
  },
  heroBanner: {
    marginHorizontal: 16,
    marginTop: -10,
    marginBottom: 8,
    borderRadius: 20,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  heroGradient: {
    padding: 24,
  },
  heroContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroText: {
    flex: 1,
  },
  heroTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text.muted,
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginBottom: 10,
  },
  heroDescription: {
    fontSize: 13,
    color: colors.text.muted,
    marginBottom: 20,
    lineHeight: 20,
  },
  heroButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  heroButtonPrimary: {
    backgroundColor: colors.primary[600]!,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
  },
  heroButtonPrimaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.white,
  },
  heroButtonSecondary: {
    backgroundColor: colors.surface.DEFAULT,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border.DEFAULT,
  },
  heroButtonSecondaryText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.heading,
  },
  heroImage: {
    width: 100,
    height: 100,
  },
  section: {
    marginBottom: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionIndicator: {
    width: 4,
    height: 24,
    backgroundColor: colors.primary[600]!,
    borderRadius: 2,
    marginRight: 10,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.heading,
    letterSpacing: -0.3,
  },
  seeAllText: {
    fontSize: 14,
    color: colors.primary[600]!,
    fontWeight: '600',
  },
  brandsScroll: {
    paddingLeft: 16,
  },
  brandItem: {
    marginRight: 10,
  },
  brandLogo: {
    backgroundColor: colors.surface.DEFAULT,
    borderWidth: 1.5,
    borderColor: colors.border.DEFAULT,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    minWidth: 90,
    alignItems: 'center',
    elevation: 1,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  brandLogoText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.heading,
  },
  scalesScroll: {
    paddingLeft: 16,
  },
  scaleChip: {
    backgroundColor: colors.primary[50]!,
    borderWidth: 1.5,
    borderColor: colors.primary[600]!,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginRight: 10,
  },
  scaleChipText: {
    fontSize: 14,
    color: colors.primary[600]!,
    fontWeight: '600',
  },
  collectorCard: {
    backgroundColor: colors.surface.DEFAULT,
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
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
    color: colors.text.heading,
  },
  collectorDesc: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 4,
  },
  collectorStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  collectorStatText: {
    fontSize: 12,
    color: colors.text.muted,
    marginLeft: 4,
  },
  viewGarageButton: {
    marginTop: 8,
  },
  viewGarageButtonText: {
    fontSize: 13,
    color: colors.text.heading,
    fontWeight: '500',
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  collectorProducts: {
    marginTop: 8,
  },
  bestSellersSection: {
    backgroundColor: colors.primary[600]!,
    paddingVertical: 24,
    borderRadius: 0,
  },
  productsScroll: {
    paddingLeft: 16,
  },
  productCardWrapper: {
    width: CARD_WIDTH * 0.9,
    marginRight: 14,
  },
  productCard: {
    marginRight: 0,
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  productImageContainer: {
    position: 'relative',
    width: '100%',
  },
  productImage: {
    width: '100%',
    height: 140,
    backgroundColor: colors.gray[200],
  },
  topLeftStack: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 6,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: colors.white,
  },
  likesContainer: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.overlay.white95,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  likesText: {
    fontSize: 12,
    color: colors.text.muted,
    marginLeft: 4,
    fontWeight: '500',
  },
  productContent: {
    padding: 14,
  },
  productTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.heading,
    marginBottom: 6,
    lineHeight: 20,
  },
  productMeta: {
    fontSize: 12,
    color: colors.text.muted,
    marginBottom: 8,
  },
  productPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.primary[700]!,
  },
  companyDetails: {
    flex: 1,
    marginLeft: 12,
  },
  companyName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.heading,
  },
  companyDesc: {
    fontSize: 12,
    color: colors.text.muted,
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
    color: colors.text.muted,
    marginLeft: 4,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  verifiedText: {
    fontSize: 12,
    color: colors.info[600]!,
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
    color: colors.text.muted,
    marginTop: 2,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },
  loadingText: {
    color: colors.overlay.white90,
    marginTop: 14,
    fontSize: 15,
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },
  emptyText: {
    color: colors.overlay.white90,
    marginTop: 14,
    fontSize: 18,
    fontWeight: '700',
  },
  emptySubtext: {
    color: colors.overlay.white70,
    marginTop: 6,
    fontSize: 14,
  },
  productsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    justifyContent: 'space-between',
  },
  gridItem: {
    width: '48%',
    marginBottom: 14,
  },
  collectionCard: {
    width: 170,
    marginRight: 14,
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  collectionImage: {
    width: '100%',
    height: 110,
    backgroundColor: colors.gray[200],
  },
  collectionInfo: {
    padding: 12,
  },
  collectionName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.heading,
  },
  collectionMeta: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 4,
  },
  featuredCard: {
    backgroundColor: colors.surface.DEFAULT,
    marginHorizontal: 16,
    borderRadius: 20,
    padding: 18,
    elevation: 3,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary[200]!,
  },
  featuredHeader: {
    flexDirection: 'row',
    marginBottom: 18,
  },
  featuredAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary[600]!,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.primary[200]!,
  },
  featuredAvatarText: {
    fontSize: 26,
    fontWeight: 'bold',
    color: colors.white,
  },
  featuredInfo: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'center',
  },
  featuredName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.heading,
  },
  featuredDesc: {
    fontSize: 13,
    color: colors.text.muted,
    marginTop: 4,
  },
  featuredStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: colors.primary[50]!,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  featuredStatText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary[600]!,
    marginLeft: 4,
  },
  featuredProducts: {
    marginBottom: 14,
  },
  featuredProductCard: {
    width: 140,
    marginRight: 12,
    backgroundColor: colors.surface.alt,
    borderRadius: 14,
    overflow: 'hidden',
  },
  featuredProductImage: {
    width: '100%',
    height: 110,
    backgroundColor: colors.gray[200],
  },
  featuredProductTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text.heading,
    padding: 10,
    paddingBottom: 4,
  },
  featuredProductPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.primary[700]!,
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  viewGarageBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary[50]!,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  viewGarageBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary[600]!,
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
    color: colors.text.heading,
    marginLeft: 4,
  },
  verifiedBadgeSmall: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  verifiedBadgeSmallText: {
    fontSize: 12,
    color: colors.success[600]!,
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
  // Company Section styles - Modern design
  companySection: {
    backgroundColor: colors.primary[50]!,
    paddingVertical: 24,
    marginBottom: 24,
  },
  businessBadge: {
    backgroundColor: colors.primary[600]!,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    marginLeft: 10,
  },
  businessBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: colors.white,
  },
  companyCard: {
    backgroundColor: colors.white,
    marginHorizontal: 16,
    borderRadius: 20,
    padding: 20,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 5,
    borderWidth: 1,
    borderColor: colors.primary[200]!,
  },
  companyHeader: {
    flexDirection: 'row',
    marginBottom: 18,
  },
  companyAvatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 3,
    borderColor: colors.primary[200]!,
  },
  companyAvatarGradient: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.primary[200]!,
  },
  companyAvatarText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.white,
  },
  companyInfo: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'center',
  },
  companyNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  companyNameText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.heading,
  },
  companyBio: {
    fontSize: 13,
    color: colors.text.muted,
    marginTop: 6,
    lineHeight: 18,
  },
  companyStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  companyStat: {
    flex: 1,
    minWidth: '45%',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  companyStatValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  companyStatLabel: {
    fontSize: 11,
    color: colors.text.muted,
    marginTop: 4,
    fontWeight: '500',
  },
  companyRating: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    backgroundColor: colors.warning[50]!,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  companyRatingValue: {
    fontSize: 15,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginLeft: 6,
  },
  companyRatingCount: {
    fontSize: 13,
    color: colors.text.muted,
    marginLeft: 6,
  },
  companySectionTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginBottom: 14,
    marginTop: 12,
  },
  companyProductsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  companyProductCard: {
    width: '31%',
    backgroundColor: colors.surface.alt,
    borderRadius: 14,
    overflow: 'hidden',
  },
  companyProductImage: {
    width: '100%',
    height: 85,
    backgroundColor: colors.gray[200],
  },
  companyProductLikes: {
    position: 'absolute',
    top: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.overlay.white95,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  companyProductLikesText: {
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 3,
    color: colors.primary[600]!,
  },
  companyProductInfo: {
    padding: 10,
  },
  companyProductTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text.heading,
    marginBottom: 6,
    lineHeight: 16,
  },
  companyProductPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.primary[700]!,
  },
  companyCollectionCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface.alt,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    alignItems: 'center',
  },
  companyCollectionImage: {
    width: 60,
    height: 60,
    borderRadius: 10,
    backgroundColor: colors.gray[200],
  },
  companyCollectionImagePlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 10,
    backgroundColor: colors.gray[200],
    justifyContent: 'center',
    alignItems: 'center',
  },
  companyCollectionInfo: {
    flex: 1,
    marginLeft: 14,
  },
  companyCollectionName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.heading,
  },
  companyCollectionMeta: {
    fontSize: 13,
    color: colors.text.muted,
    marginTop: 4,
  },
  companyCollectionStats: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 6,
  },
  companyCollectionStatText: {
    fontSize: 12,
    color: colors.info[600]!,
    fontWeight: '500',
  },
  companyCollectionStatTextRed: {
    fontSize: 12,
    color: colors.danger[600]!,
    fontWeight: '500',
  },
  viewStoreButton: {
    marginTop: 18,
  },
  viewStoreButtonGradient: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  viewStoreButtonText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: colors.white,
  },
});

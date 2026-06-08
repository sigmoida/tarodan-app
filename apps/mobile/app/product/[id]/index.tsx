import { useState, useEffect, useRef } from 'react';
import { View, ScrollView, Image, Dimensions, StyleSheet, Pressable, Share, Modal } from 'react-native';
import {
  Button,
  IconButton,
  Spinner,
  Snackbar,
  Divider,
  Avatar,
  Text,
  theme,
} from '@tarodan/ui-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { productsApi, ratingsApi, userReportsApi } from '../../../src/services/api';
import { ThemedRefreshControl } from '../../../src/components/common';
import { useRefresh } from '../../../src/hooks/useRefresh';
import { useAuthStore } from '../../../src/stores/authStore';
import { Alert } from 'react-native';
import { useCartStore } from '../../../src/stores/cartStore';
import { useGuestStore } from '../../../src/stores/guestStore';
import { useFavoritesStore } from '../../../src/stores/favoritesStore';
import { SignupPrompt } from '../../../src/components/SignupPrompt';
import MakeOfferModal from '../../../src/components/product/MakeOfferModal';
import AddToCollectionModal from '../../../src/components/product/AddToCollectionModal';
import { transformImageUrl, getImageUrl as getImageUrlFromUtils, resolveAvatarSource } from '../../../src/utils/imageUrl';
import { asLabel } from '../../../src/utils/format';
import { isProductTradeOpen } from '../../../src/utils/isProductTradeOpen';

const { colors } = theme;

const { width } = Dimensions.get('window');

// Local condition palette — replaces TarodanColors-driven CONDITIONS
const CONDITION_LABELS: Record<string, { name: string; color: string }> = {
  new: { name: 'Sıfır', color: colors.success[600]! },
  like_new: { name: 'Az Kullanılmış', color: colors.info[400]! },
  good: { name: 'İyi', color: colors.info[600]! },
  fair: { name: 'Orta', color: colors.warning[500]! },
  poor: { name: 'Hasarlı', color: colors.danger[600]! },
};

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams();
  const productId = String(id);
  const { isAuthenticated, user } = useAuthStore();
  const { addItem, isInCart } = useCartStore();
  const { incrementProductView, getPromptType, setLastPromptShown, canShowPrompt } = useGuestStore();
  const { addToFavorites, removeFromFavorites, isInFavorites, fetchFavorites } = useFavoritesStore();
  const queryClient = useQueryClient();

  const [currentImage, setCurrentImage] = useState(0);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '', type: 'success' as 'success' | 'error' });
  const [showAllDescription, setShowAllDescription] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [promptType, setPromptType] = useState<'favorites' | 'message' | 'purchase' | 'trade' | 'collections' | null>(null);
  const [offerModalOpen, setOfferModalOpen] = useState(false);
  const [collectionModalOpen, setCollectionModalOpen] = useState(false);
  // Tam ekran görsel görüntüleyici (G1 — pinch-zoom)
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  // Check if product is in favorites when authenticated
  useEffect(() => {
    if (isAuthenticated && productId) {
      fetchFavorites().then(() => {
        setIsFavorite(isInFavorites(productId));
      });
    }
  }, [isAuthenticated, productId]);

  // Track product view for guests
  useEffect(() => {
    if (!isAuthenticated && id) {
      incrementProductView();

      // Check if we should show a signup prompt
      const type = getPromptType();
      if (type && canShowPrompt()) {
        const timer = setTimeout(() => {
          setPromptType(type);
          setShowPrompt(true);
          setLastPromptShown(type);
        }, 5000);
        return () => clearTimeout(timer);
      }
    }
  }, [id, isAuthenticated]);

  // Görüntülenme sayacı ürün başına 1 kez artırılır (web ile parite).
  const viewCountedRef = useRef(false);
  useEffect(() => {
    viewCountedRef.current = false;
  }, [id]);

  // Web ile aynı endpoint: GET /products/:id
  const { data: apiProduct, isLoading, refetch: refetchProduct } = useQuery({
    queryKey: ['product', id],
    queryFn: async () => {
      try {
        const response = await productsApi.getOne(productId);
        const product = response.data.data || response.data;
        // Web ile parite: ürünü çektikten sonra görüntülenmeyi say (POST /products/:id/view).
        if (product && !viewCountedRef.current) {
          viewCountedRef.current = true;
          try {
            const viewResp: any = await productsApi.incrementView(productId);
            const vc = viewResp?.data?.viewCount ?? viewResp?.data?.data?.viewCount;
            if (vc !== undefined) product.viewCount = vc;
            // Liste/öne-çıkan ekranlardaki görüntülenme bayatlamasın — geri dönünce tazelensin
            queryClient.invalidateQueries({ queryKey: ['products'] });
            queryClient.invalidateQueries({ queryKey: ['products-search'] });
            queryClient.invalidateQueries({ queryKey: ['featured-business'] });
            queryClient.invalidateQueries({ queryKey: ['featured-collector'] });
          } catch {
            // görüntülenme sayımı kritik değil — yoksay
          }
        }
        return product;
      } catch (error) {
        // Public endpoint pending/rejected/draft (ve stoklu inactive) ilanları 404 döndürür —
        // görünürlük sınırı. Kullanıcı giriş yapmışsa kendi ilanı olabilir; sahibe özel
        // endpoint (GET /products/my/:id) her statüde döner. Görüntülenme sayılmaz (kendi ilanı).
        if (isAuthenticated) {
          try {
            const mineResp = await productsApi.getMyById(productId);
            return mineResp.data.data || mineResp.data;
          } catch {
            // sahibi değil ya da gerçekten yok — aşağıda null
          }
        }
        console.log('⚠️ Ürün detayı yüklenemedi');
        return null;
      }
    },
    retry: 1,
  });

  // Web ile aynı endpoint: GET /ratings/products/:id
  const { data: reviews, refetch: refetchReviews } = useQuery({
    queryKey: ['product-reviews', id],
    queryFn: async () => {
      try {
        const response = await ratingsApi.getProductRatings(productId);
        // API şekli: { ratings, total, page, pageSize }
        const data: any = response.data;
        return data?.ratings ?? data?.items ?? data?.data ?? (Array.isArray(data) ? data : []);
      } catch {
        return [];
      }
    },
    enabled: !!id,
  });

  const { refreshing, onRefresh } = useRefresh(refetchProduct, refetchReviews);

  // Sahibi mi? (kendi ilanını görüntülüyor olabilir — pending/sold/inactive dahil)
  const isOwner = Boolean(
    isAuthenticated && user?.id && apiProduct?.seller?.id && user.id === apiProduct.seller.id
  );

  // Not: Stoğu biten (sold / inactive+qty0) ilanlar artık unavailable sayfasına
  // YÖNLENDİRİLMEZ — normal detayda "Stokta yok" rozeti + pasif satın al ile kalır.
  // Gerçekten görüntülenemeyen ilanlar (pending/rejected, elle pasife alınan inactive+qty>0)
  // public endpoint'ten zaten 404 döner → product null → "Ürün bulunamadı" gösterilir.

  // Favori (beğeni) sayısını server'daki likeCount'tan senkronize et
  useEffect(() => {
    if (apiProduct) setFavoriteCount(apiProduct.likeCount ?? 0);
  }, [apiProduct]);

  const product = apiProduct;
  // Görsel URL'lerini çöz (cardUrl/detailUrl/url) — yoksa placeholder.
  const images = product?.images?.length > 0
    ? product.images.map((img: any) => {
        const uri = transformImageUrl(img);
        return typeof img === 'string' ? uri : { ...img, url: uri };
      })
    : ['https://placehold.co/400x400/f3f4f6/9ca3af?text=Ürün'];

  // Tüm hook'lar yukarıda tamamlandı — buradan sonra erken çıkış güvenli.
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Spinner size="lg" />
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      </View>
    );
  }
  if (!product) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="cube-outline" size={64} color={colors.text.muted} />
        <Text style={styles.loadingText}>Ürün bulunamadı</Text>
        <Button
          variant="primary"
          title="Geri Dön"
          onPress={() => router.back()}
          style={{ marginTop: 16 }}
        />
      </View>
    );
  }

  const getConditionInfo = (condition: string) => {
    return CONDITION_LABELS[condition] || { name: condition, color: colors.gray[500] };
  };

  // Stokta yok: active dışı statü veya müsait adet 0 (null = sınırsız stok → stokta).
  const isOutOfStock =
    (product.status != null && product.status !== 'active') ||
    (product.availableQuantity != null && product.availableQuantity <= 0);

  const handleAddToCart = () => {
    if (isOutOfStock) {
      setSnackbar({ visible: true, message: 'Bu ürün şu anda stokta yok', type: 'error' });
      return;
    }
    addItem({
      productId: product.id,
      title: product.title,
      price: product.price,
      imageUrl: typeof images[0] === 'string' ? images[0] : images[0]?.url || getImageUrlFromUtils(product.images),
      brand: asLabel(product.brand, ''),
      scale: asLabel(product.scale, ''),
      seller: {
        id: product.seller?.id || 'unknown',
        displayName: product.seller?.displayName || 'Satıcı',
      },
    });
    setSnackbar({ visible: true, message: 'Ürün sepete eklendi!', type: 'success' });
  };

  const handleFavorite = async () => {
    if (!isAuthenticated) {
      setSnackbar({ visible: true, message: 'Favorilere eklemek için üye olun', type: 'error' });
      setTimeout(() => router.push('/(auth)/login'), 1500);
      return;
    }

    setFavoriteLoading(true);
    try {
      if (isFavorite) {
        const success = await removeFromFavorites(productId);
        if (success) {
          setIsFavorite(false);
          setFavoriteCount((c) => Math.max(0, c - 1)); // beğeni sayısı anında güncellensin
          invalidateProductLists();
          setSnackbar({ visible: true, message: 'Favorilerden kaldırıldı', type: 'success' });
        } else {
          setSnackbar({ visible: true, message: 'Favorilerden kaldırılamadı', type: 'error' });
        }
      } else {
        const success = await addToFavorites(productId);
        if (success) {
          setIsFavorite(true);
          setFavoriteCount((c) => c + 1); // beğeni sayısı anında güncellensin
          invalidateProductLists();
          setSnackbar({ visible: true, message: 'Favorilere eklendi!', type: 'success' });
        } else {
          setSnackbar({ visible: true, message: 'Favorilere eklenemedi', type: 'error' });
        }
      }
    } catch (error) {
      setSnackbar({ visible: true, message: 'Bir hata oluştu', type: 'error' });
    } finally {
      setFavoriteLoading(false);
    }
  };

  // Beğeni/görüntülenme değişince tüm liste ekranları (home/öne çıkanlar/arama) tazelensin
  const invalidateProductLists = () => {
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['products-search'] });
    queryClient.invalidateQueries({ queryKey: ['featured-business'] });
    queryClient.invalidateQueries({ queryKey: ['featured-collector'] });
  };

  const handleMessage = () => {
    if (!isAuthenticated) {
      setSnackbar({ visible: true, message: 'Mesaj göndermek için üye olun', type: 'error' });
      setTimeout(() => router.push('/(auth)/login'), 1500);
      return;
    }
    // Navigate to new message with seller and product context
    router.push(`/messages/new?sellerId=${product.seller?.id}&productId=${productId}&productTitle=${encodeURIComponent(product.title)}`);
  };

  const handleTrade = () => {
    if (!isAuthenticated) {
      setSnackbar({ visible: true, message: 'Takas teklifi için üye olun', type: 'error' });
      setTimeout(() => router.push('/(auth)/login' as any), 1500);
      return;
    }
    if (!product.seller?.id) {
      setSnackbar({ visible: true, message: 'Satıcı bilgisi bulunamadı', type: 'error' });
      return;
    }
    // /trade/new ekranı targetProductId + targetSellerId paramları bekliyor
    router.push(
      `/trade/new?targetProductId=${id}&targetSellerId=${product.seller.id}` as any,
    );
  };

  const handleMakeOffer = () => {
    if (!isAuthenticated) {
      setSnackbar({ visible: true, message: 'Teklif vermek için üye olun', type: 'error' });
      setTimeout(() => router.push('/(auth)/login' as any), 1500);
      return;
    }
    if (product.seller?.id && user?.id === product.seller.id) {
      setSnackbar({ visible: true, message: 'Kendi ürününüze teklif veremezsiniz', type: 'error' });
      return;
    }
    setOfferModalOpen(true);
  };

  const handleAddToCollection = () => {
    if (!isAuthenticated) {
      setSnackbar({ visible: true, message: 'Koleksiyon için üye olun', type: 'error' });
      setTimeout(() => router.push('/(auth)/login' as any), 1500);
      return;
    }
    setCollectionModalOpen(true);
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `${product.title} - ₺${product.price?.toLocaleString('tr-TR')}\n\nTarodan'da bu ürüne göz atın!`,
        title: product.title,
      });
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  const handleReport = () => {
    if (!isAuthenticated) {
      setSnackbar({ visible: true, message: 'Raporlamak için giriş yapmalısınız', type: 'error' });
      return;
    }

    const REPORT_REASONS = [
      { key: 'spam', label: 'Spam' },
      { key: 'fake_product', label: 'Sahte Ürün' },
      { key: 'scam', label: 'Dolandırıcılık' },
      { key: 'counterfeit', label: 'Taklit Ürün' },
      { key: 'wrong_category', label: 'Yanlış Kategori' },
      { key: 'misleading_info', label: 'Yanıltıcı Bilgi' },
      { key: 'inappropriate_content', label: 'Uygunsuz İçerik' },
      { key: 'other', label: 'Diğer' },
    ];

    Alert.alert(
      'İlanı Raporla',
      'Bu ilanı neden raporlamak istiyorsunuz?',
      [
        ...REPORT_REASONS.map((reason) => ({
          text: reason.label,
          onPress: async () => {
            try {
              await userReportsApi.create({
                type: 'product',
                targetId: productId,
                reason: reason.key as any,
              });
              setSnackbar({ visible: true, message: 'Raporunuz alındı. Teşekkür ederiz!', type: 'success' });
            } catch (error: any) {
              const message = error.response?.data?.message || 'Rapor gönderilemedi';
              setSnackbar({ visible: true, message, type: 'error' });
            }
          },
        })),
        { text: 'İptal', style: 'cancel' },
      ],
      { cancelable: true }
    );
  };

  const conditionInfo = getConditionInfo(product.condition);
  const inCart = isInCart(productId);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Geri">
          <Ionicons name="arrow-back" size={24} color={colors.white} />
        </Pressable>
        <View style={styles.headerActions}>
          <Pressable onPress={handleReport} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Raporla">
            <Ionicons name="flag-outline" size={22} color={colors.white} />
          </Pressable>
          <Pressable onPress={handleShare} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Paylaş">
            <Ionicons name="share-outline" size={24} color={colors.white} />
          </Pressable>
          <Pressable
            onPress={handleFavorite}
            style={styles.headerButton}
            disabled={favoriteLoading}
            accessibilityRole="button"
            accessibilityLabel="Favorilere ekle"
          >
            {favoriteLoading ? (
              <Spinner size="sm" color={colors.white} />
            ) : (
              <Ionicons
                name={isFavorite ? "heart" : "heart-outline"}
                size={24}
                color={isFavorite ? colors.danger[600]! : colors.white}
              />
            )}
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<ThemedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Image Gallery */}
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={(e) => {
            const page = Math.round(e.nativeEvent.contentOffset.x / width);
            setCurrentImage(page);
          }}
          scrollEventThrottle={16}
        >
          {images.map((img: any, index: number) => {
            const uri = typeof img === 'string' ? img : img.url;
            return (
              <Pressable
                key={index}
                onPress={() => { setViewerIndex(index); setImageViewerOpen(true); }}
                accessibilityRole="imagebutton"
                accessibilityLabel="Fotoğrafı büyüt"
              >
                <Image
                  source={{ uri }}
                  style={styles.productImage}
                  resizeMode="contain"
                />
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Image Indicators */}
        {images.length > 1 && (
          <View style={styles.imageIndicators}>
            {images.map((_: any, index: number) => (
              <View
                key={index}
                style={[
                  styles.indicator,
                  currentImage === index && styles.indicatorActive
                ]}
              />
            ))}
          </View>
        )}

        {/* Main Content */}
        <View style={styles.mainContent}>
          {/* Badges */}
          <View style={styles.badgeRow}>
            {isProductTradeOpen(product) && (
              <View style={[styles.badge, { backgroundColor: colors.success[500]! }]}>
                <Ionicons name="swap-horizontal" size={14} color={colors.white} />
                <Text style={styles.badgeText}>Takas Açık</Text>
              </View>
            )}
            <View style={[styles.badge, { backgroundColor: conditionInfo.color }]}>
              <Text style={styles.badgeText}>{conditionInfo.name}</Text>
            </View>
          </View>

          {/* Title & Price */}
          <Text style={styles.title}>{product.title}</Text>
          <Text style={styles.price}>₺{product.price?.toLocaleString('tr-TR')}</Text>

          {/* Ürün puanı */}
          {product.rating?.average != null && (product.rating?.count ?? 0) > 0 ? (
            <Pressable
              style={styles.headerRatingRow}
              onPress={() => router.push(`/product/${id}/reviews`)}
            >
              <Ionicons name="star" size={16} color={colors.warning[500]!} />
              <Text style={styles.headerRatingValue}>{Number(product.rating.average).toFixed(1)}</Text>
              <Text style={styles.headerRatingCount}>({product.rating.count} değerlendirme)</Text>
            </Pressable>
          ) : null}

          {/* Quick Info */}
          <View style={styles.quickInfo}>
            <View style={styles.quickInfoItem}>
              <Ionicons name="eye-outline" size={16} color={colors.text.muted} />
              <Text style={styles.quickInfoText}>{product.viewCount || 0} görüntülenme</Text>
            </View>
            <View style={styles.quickInfoItem}>
              <Ionicons name="heart-outline" size={16} color={colors.text.muted} />
              <Text style={styles.quickInfoText}>{favoriteCount} favori</Text>
            </View>
            <View style={styles.quickInfoItem}>
              <Ionicons name="time-outline" size={16} color={colors.text.muted} />
              <Text style={styles.quickInfoText}>
                {new Date(product.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
              </Text>
            </View>
          </View>

          <Divider style={styles.divider} />

          {/* Aksiyon Bar — sahibine göre değişir.
              Sahip: Koleksiyon + Paylaş. Diğer kullanıcı: Takas / Teklif / Mesaj / Paylaş. */}
          <View style={styles.actionGrid}>
            {!isOwner && isProductTradeOpen(product) ? (
              <Pressable style={styles.actionItem} onPress={handleTrade}>
                <View style={[styles.actionIconWrap, { backgroundColor: colors.success[100]! }]}>
                  <Ionicons name="swap-horizontal" size={22} color={colors.success[600]!} />
                </View>
                <Text style={styles.actionLabel}>Takas</Text>
              </Pressable>
            ) : null}

            {!isOwner && (
              <Pressable style={styles.actionItem} onPress={handleMakeOffer}>
                <View style={[styles.actionIconWrap, { backgroundColor: colors.warning[50]! }]}>
                  <Ionicons name="pricetag-outline" size={22} color={colors.warning[600]!} />
                </View>
                <Text style={styles.actionLabel}>Teklif Ver</Text>
              </Pressable>
            )}

            {isOwner && (
              <Pressable style={styles.actionItem} onPress={handleAddToCollection}>
                <View style={[styles.actionIconWrap, { backgroundColor: colors.primary[50]! }]}>
                  <Ionicons name="albums-outline" size={22} color={colors.primary[600]!} />
                </View>
                <Text style={styles.actionLabel}>Koleksiyon</Text>
              </Pressable>
            )}

            {!isOwner && (
              <Pressable style={styles.actionItem} onPress={handleMessage}>
                <View style={[styles.actionIconWrap, { backgroundColor: colors.info[50]! }]}>
                  <Ionicons name="chatbubble-outline" size={22} color={colors.info[600]!} />
                </View>
                <Text style={styles.actionLabel}>Mesaj</Text>
              </Pressable>
            )}

            <Pressable style={styles.actionItem} onPress={handleShare}>
              <View style={[styles.actionIconWrap, { backgroundColor: colors.success[50]! }]}>
                <Ionicons name="share-social-outline" size={22} color={colors.success[600]!} />
              </View>
              <Text style={styles.actionLabel}>Paylaş</Text>
            </Pressable>
          </View>

          <Divider style={styles.divider} />

          {/* Specifications */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Özellikler</Text>
            <View style={styles.specGrid}>
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>Marka</Text>
                <Text style={styles.specValue}>{asLabel(product.brand)}</Text>
              </View>
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>Ölçek</Text>
                <Text style={styles.specValue}>{asLabel(product.scale)}</Text>
              </View>
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>Durum</Text>
                <Text style={[styles.specValue, { color: conditionInfo.color }]}>
                  {conditionInfo.name}
                </Text>
              </View>
              {product.category && (
                <View style={styles.specItem}>
                  <Text style={styles.specLabel}>Kategori</Text>
                  <Text style={styles.specValue}>
                    {typeof product.category === 'object' ? product.category.name : product.category}
                  </Text>
                </View>
              )}
              {product.year && (
                <View style={styles.specItem}>
                  <Text style={styles.specLabel}>Model Yılı</Text>
                  <Text style={styles.specValue}>{product.year}</Text>
                </View>
              )}
            </View>
          </View>

          <Divider style={styles.divider} />

          {/* Description */}
          {product.description && (
            <>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Açıklama</Text>
                <Text
                  style={styles.description}
                  numberOfLines={showAllDescription ? undefined : 4}
                >
                  {product.description}
                </Text>
                {product.description.length > 200 && (
                  <Pressable onPress={() => setShowAllDescription(!showAllDescription)}>
                    <Text style={styles.readMore}>
                      {showAllDescription ? 'Daha az göster' : 'Devamını oku'}
                    </Text>
                  </Pressable>
                )}
              </View>
              <Divider style={styles.divider} />
            </>
          )}

          {/* Seller */}
          <Pressable
            style={styles.sellerCard}
            onPress={() => router.push(`/seller/${product.seller?.id}`)}
          >
            <Avatar
              size="lg"
              name={product.seller?.displayName || 'Satıcı'}
              source={resolveAvatarSource((product.seller as any)?.avatarUrl)}
            />
            <View style={styles.sellerInfo}>
              <View style={styles.sellerNameRow}>
                <Text style={styles.sellerName}>{product.seller?.displayName}</Text>
                {product.seller?.verified && (
                  <Ionicons name="checkmark-circle" size={18} color={colors.success[500]!} />
                )}
              </View>
              <View style={styles.sellerStats}>
                <View style={styles.sellerStat}>
                  <Ionicons name="star" size={14} color={colors.warning[500]!} />
                  <Text style={styles.sellerStatText}>{product.seller?.rating || 0}</Text>
                </View>
                <View style={styles.sellerStat}>
                  <Ionicons name="bag-check-outline" size={14} color={colors.text.muted} />
                  <Text style={styles.sellerStatText}>{product.seller?.totalSales || 0} satış</Text>
                </View>
              </View>
              <Text style={styles.sellerResponseTime}>
                Yanıt süresi: {product.seller?.responseTime || 'Bilinmiyor'}
              </Text>
            </View>
            <View style={styles.sellerAction}>
              <IconButton
                icon="chatbubble-outline"
                size="sm"
                color={colors.primary[600]!}
                style={styles.messageButton}
                onPress={handleMessage}
                accessibilityLabel="Satıcıya mesaj gönder"
              />
              <Ionicons name="chevron-forward" size={20} color={colors.text.muted} />
            </View>
          </Pressable>

          <Divider style={styles.divider} />

          {/* Reviews */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Değerlendirmeler</Text>
              <Pressable onPress={() => router.push(`/product/${id}/reviews`)}>
                <Text style={styles.seeAll}>Tümünü Gör</Text>
              </Pressable>
            </View>

            {(Array.isArray(reviews) ? reviews : []).slice(0, 2).map((review: any) => {
              // Ürün değerlendirmesi DTO'su: { score, title, review, createdAt, user: { displayName } }
              const score = review.score ?? review.rating ?? 0;
              const reviewerName = review.user?.displayName ?? review.userName ?? review.reviewer?.displayName ?? 'Kullanıcı';
              const reviewText = review.review ?? review.comment;
              const dateStr = review.createdAt ?? review.date;
              return (
                <View key={review.id} style={styles.reviewCard}>
                  <View style={styles.reviewHeader}>
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
                    </View>
                  </View>
                  {review.title ? <Text style={styles.reviewTitle}>{review.title}</Text> : null}
                  {reviewText ? <Text style={styles.reviewComment}>{reviewText}</Text> : null}
                  {dateStr ? (
                    <Text style={styles.reviewDate}>
                      {new Date(dateStr).toLocaleDateString('tr-TR')}
                    </Text>
                  ) : null}
                </View>
              );
            })}

            {(!Array.isArray(reviews) || reviews.length === 0) && (
              <Text style={styles.noReviews}>Henüz değerlendirme yok</Text>
            )}
          </View>

          {/* Security Notice */}
          <View style={styles.securityNotice}>
            <Ionicons name="shield-checkmark" size={24} color={colors.success[500]!} />
            <View style={styles.securityContent}>
              <Text style={styles.securityTitle}>Güvenli Alışveriş</Text>
              <Text style={styles.securityText}>
                Ödemeniz, ürün elinize ulaşana kadar güvende tutulur.
              </Text>
            </View>
          </View>

          <View style={{ height: 120 }} />
        </View>
      </ScrollView>

      {/* Bottom Actions */}
      <View style={styles.bottomBar}>
        <View style={styles.bottomPrice}>
          <Text style={styles.bottomPriceLabel}>Fiyat</Text>
          <Text style={styles.bottomPriceValue}>₺{product.price?.toLocaleString('tr-TR')}</Text>
        </View>
        <View style={styles.bottomButtons}>
          {isOwner ? (
            <Button
              testID="product-detail-edit-button"
              variant="primary"
              onPress={() => router.push(`/listing/${product.id}/edit` as any)}
              icon="create-outline"
              style={styles.cartButton}
            >
              İlanı Düzenle
            </Button>
          ) : isOutOfStock ? (
            <Button
              testID="product-detail-out-of-stock-button"
              variant="secondary"
              onPress={() => {}}
              disabled
              icon="close-circle-outline"
              style={styles.cartButton}
            >
              Stokta Yok
            </Button>
          ) : (
            <>
              {isProductTradeOpen(product) && (
                <Button
                  variant="outline"
                  onPress={handleTrade}
                  icon="swap-horizontal"
                  style={styles.tradeButton}
                  textStyle={styles.tradeButtonLabel}
                >
                  Takas
                </Button>
              )}
              {inCart ? (
                <Button
                  testID="product-detail-go-to-cart-button"
                  variant="outline"
                  onPress={() => router.push('/cart')}
                  icon="checkmark-circle"
                  style={styles.cartButton}
                >
                  Sepette • Git
                </Button>
              ) : (
                <Button
                  testID="product-detail-add-to-cart-button"
                  variant="primary"
                  onPress={handleAddToCart}
                  icon="cart"
                  style={styles.cartButton}
                >
                  Sepete Ekle
                </Button>
              )}
            </>
          )}
        </View>
      </View>

      {/* Tam ekran görsel görüntüleyici — pinch-zoom (G1) */}
      <Modal
        visible={imageViewerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setImageViewerOpen(false)}
      >
        <View style={styles.viewerContainer}>
          <Pressable
            style={styles.viewerClose}
            onPress={() => setImageViewerOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Kapat"
          >
            <Ionicons name="close" size={30} color={colors.white} />
          </Pressable>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            contentOffset={{ x: viewerIndex * width, y: 0 }}
          >
            {images.map((img: any, index: number) => {
              const uri = typeof img === 'string' ? img : img.url;
              return (
                <ScrollView
                  key={index}
                  style={styles.viewerPageScroll}
                  contentContainerStyle={styles.viewerPage}
                  maximumZoomScale={3}
                  minimumZoomScale={1}
                  showsVerticalScrollIndicator={false}
                  showsHorizontalScrollIndicator={false}
                  centerContent
                >
                  <Image source={{ uri }} style={styles.viewerImage} resizeMode="contain" />
                </ScrollView>
              );
            })}
          </ScrollView>
        </View>
      </Modal>

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ ...snackbar, visible: false })}
        duration={2000}
        variant={snackbar.type === 'success' ? 'success' : 'danger'}
        action={
          snackbar.type === 'success' && snackbar.message.includes('sepet')
            ? { label: 'Sepete Git', onPress: () => router.push('/cart') }
            : undefined
        }
      >
        {snackbar.message}
      </Snackbar>

      {/* Signup Prompt for Guests */}
      {promptType && (
        <SignupPrompt
          visible={showPrompt}
          onDismiss={() => setShowPrompt(false)}
          type={promptType}
        />
      )}

      {/* Teklif Ver Modal */}
      <MakeOfferModal
        visible={offerModalOpen}
        onDismiss={() => setOfferModalOpen(false)}
        productId={productId}
        productTitle={product.title}
        listPrice={product.price}
        onSuccess={() => {
          setOfferModalOpen(false);
          setSnackbar({ visible: true, message: 'Teklifiniz gönderildi', type: 'success' });
        }}
      />

      {/* Koleksiyona Ekle Modal */}
      <AddToCollectionModal
        visible={collectionModalOpen}
        onDismiss={() => setCollectionModalOpen(false)}
        productId={productId}
        onSuccess={(collectionName) => {
          setCollectionModalOpen(false);
          setSnackbar({
            visible: true,
            message: `"${collectionName}" koleksiyonuna eklendi`,
            type: 'success',
          });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.white,
  },
  loadingText: {
    marginTop: 16,
    color: colors.text.muted,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.overlay.black30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  content: {
    flex: 1,
  },
  productImage: {
    width,
    height: width,
    backgroundColor: colors.gray[50],
  },
  viewerContainer: {
    flex: 1,
    backgroundColor: colors.black,
  },
  viewerClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.overlay.black50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerPageScroll: {
    width,
  },
  viewerPage: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerImage: {
    width,
    height: width,
  },
  imageIndicators: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: colors.white,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border.DEFAULT,
    marginHorizontal: 4,
  },
  indicatorActive: {
    backgroundColor: colors.primary[600]!,
    width: 24,
  },
  mainContent: {
    padding: 16,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
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
    color: colors.white,
    fontSize: 12,
    fontWeight: '600',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginBottom: 8,
  },
  price: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: 'bold',
    color: colors.primary[600]!,
    marginBottom: 12,
    alignSelf: 'flex-start',
    includeFontPadding: false,
    paddingRight: 4,
  },
  quickInfo: {
    flexDirection: 'row',
    gap: 16,
  },
  quickInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  quickInfoText: {
    fontSize: 13,
    color: colors.text.muted,
  },
  divider: {
    marginVertical: 16,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // flex-start: buton sayısı sahibe göre değiştiğinden (2 vs 4) sola hizalı
    // sabit aralık, space-between'in az butonda oluşturduğu boşluğu önler.
    justifyContent: 'flex-start',
    gap: 12,
  },
  actionItem: {
    width: '18%',
    minWidth: 60,
    alignItems: 'center',
    gap: 6,
  },
  actionIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: 11,
    color: colors.text.heading,
    fontWeight: '500',
    textAlign: 'center',
  },
  section: {
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.heading,
    marginBottom: 12,
  },
  seeAll: {
    fontSize: 14,
    color: colors.primary[600]!,
    fontWeight: '500',
  },
  specGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  specItem: {
    width: '50%',
    marginBottom: 12,
  },
  specLabel: {
    fontSize: 13,
    color: colors.text.muted,
    marginBottom: 2,
  },
  specValue: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text.heading,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.text.heading,
  },
  readMore: {
    color: colors.primary[600]!,
    marginTop: 8,
    fontWeight: '500',
  },
  sellerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray[50],
    borderRadius: 12,
    padding: 16,
  },
  sellerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  sellerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sellerName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.heading,
  },
  sellerStats: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  sellerStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sellerStatText: {
    fontSize: 13,
    color: colors.text.muted,
  },
  sellerResponseTime: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 4,
  },
  sellerAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  messageButton: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.primary[600]!,
  },
  reviewCard: {
    backgroundColor: colors.gray[50],
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reviewerName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.heading,
  },
  ratingStars: {
    flexDirection: 'row',
    gap: 2,
  },
  reviewTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.heading,
    marginBottom: 2,
  },
  reviewComment: {
    fontSize: 14,
    color: colors.text.heading,
    lineHeight: 20,
  },
  reviewDate: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 8,
  },
  headerRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  headerRatingValue: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.heading,
  },
  headerRatingCount: {
    fontSize: 13,
    color: colors.text.muted,
  },
  noReviews: {
    fontSize: 14,
    color: colors.text.muted,
    fontStyle: 'italic',
  },
  securityNotice: {
    flexDirection: 'row',
    backgroundColor: colors.success[50]!,
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  securityContent: {
    flex: 1,
    marginLeft: 12,
  },
  securityTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.success[600]!,
  },
  securityText: {
    fontSize: 13,
    color: colors.success[700]!,
    marginTop: 2,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border.DEFAULT,
  },
  bottomPrice: {
    marginRight: 16,
    flexShrink: 0,
  },
  bottomPriceLabel: {
    fontSize: 12,
    color: colors.text.muted,
  },
  bottomPriceValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.heading,
    flexShrink: 0,
    includeFontPadding: false,
    paddingRight: 2,
  },
  bottomButtons: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  tradeButton: {
    flex: 1,
    borderRadius: 12,
    borderColor: colors.primary[600]!,
  },
  tradeButtonLabel: {
    color: colors.primary[600]!,
  },
  cartButton: {
    flex: 2,
    borderRadius: 12,
  },
});

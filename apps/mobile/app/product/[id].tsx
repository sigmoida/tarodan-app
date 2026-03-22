import { useState, useEffect } from 'react';
import { View, ScrollView, Image, Dimensions, StyleSheet, TouchableOpacity, Share } from 'react-native';
import { Text, Button, Chip, Card, Avatar, IconButton, ActivityIndicator, Snackbar, Divider, Modal, Portal, TextInput as PaperInput } from 'react-native-paper';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { productsApi, ratingsApi, userReportsApi, offersApi, api } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';
import { Alert } from 'react-native';
import { useCartStore } from '../../src/stores/cartStore';
import { useGuestStore } from '../../src/stores/guestStore';
import { useFavoritesStore } from '../../src/stores/favoritesStore';
import { SignupPrompt } from '../../src/components/SignupPrompt';
import { TarodanColors, CONDITIONS } from '../../src/theme';
import { transformImageUrl, getImageUrl as getImageUrlFromUtils } from '../../src/utils/imageUrl';
import { getProductEffectivePrice, isProductOnSaleDisplay, getProductOriginalPriceForDisplay } from '../../src/utils/productPrice';
import { safeString } from '../../src/utils/safeString';
import { isProductTradeOpen } from '../../src/utils/isProductTradeOpen';
import { formatApiErrorMessage } from '../../src/utils/formatApiErrorMessage';

const { width } = Dimensions.get('window');


export default function ProductDetailScreen() {
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams();
  const productId = String(id);
  const { isAuthenticated, user } = useAuthStore();
  const { addItem } = useCartStore();
  const { incrementProductView, getPromptType, setLastPromptShown, canShowPrompt } = useGuestStore();
  const { addToFavorites, removeFromFavorites, isInFavorites, fetchFavorites } = useFavoritesStore();
  
  const [currentImage, setCurrentImage] = useState(0);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '', type: 'success' as 'success' | 'error' });
  const [showAllDescription, setShowAllDescription] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [promptType, setPromptType] = useState<'favorites' | 'message' | 'purchase' | 'trade' | 'collections' | null>(null);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [offerAmount, setOfferAmount] = useState('');
  const [offerMessage, setOfferMessage] = useState('');
  const [offerLoading, setOfferLoading] = useState(false);

  // Check if product is in favorites when authenticated
  useEffect(() => {
    if (isAuthenticated && productId) {
      fetchFavorites().then(() => {
        setIsFavorite(isInFavorites(productId));
      });
    }
  }, [isAuthenticated, productId]);

  useEffect(() => {
    if (productId) {
      api.post(`/products/${productId}/view`).catch(() => {});
    }
  }, [productId]);

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

  const { data: product, isLoading, isError } = useQuery({
    queryKey: ['product', id],
    queryFn: async () => {
      const response = await productsApi.getOne(productId);
      return response.data.data || response.data;
    },
    retry: 1,
  });

  const { data: reviews } = useQuery({
    queryKey: ['product-reviews', id],
    queryFn: async () => {
      const response = await ratingsApi.getProductRatings(productId);
      return response.data.data || response.data || [];
    },
    enabled: !!id,
  });

  if (isLoading && !product) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={TarodanColors.primary} />
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      </View>
    );
  }
  if (isError || !product) {
    return (
      <View style={[styles.loadingContainer, { padding: 24 }]}>
        <Ionicons name="alert-circle-outline" size={48} color={TarodanColors.error} />
        <Text style={[styles.loadingText, { fontSize: 18, fontWeight: '600', marginTop: 16 }]}>Ürün bulunamadı</Text>
        <Button mode="contained" onPress={() => router.back()} style={{ marginTop: 16 }}>Geri Dön</Button>
      </View>
    );
  }

  const images = product.images?.length > 0 
    ? product.images.map((img: any) => {
        if (typeof img === 'string') return transformImageUrl(img);
        const url = img.detailUrl || img.cardUrl || img.url || img.imageUrl;
        return { ...img, url: transformImageUrl(url) };
      })
    : ['https://placehold.co/400x400/f3f4f6/9ca3af?text=Ürün'];

  const getConditionInfo = (condition: string) => {
    return CONDITIONS.find(c => c.id === condition) || { name: condition, color: '#757575' };
  };

  const handleAddToCart = () => {
    addItem({
      productId: product.id,
      title: product.title,
      price: product.price,
      imageUrl: typeof images[0] === 'string' ? images[0] : images[0]?.url || getImageUrlFromUtils(product.images),
      brand: safeString(product.brand),
      scale: safeString(product.scale),
      seller: {
        id: product.seller?.id || 'unknown',
        displayName: product.seller?.displayName || 'Satıcı',
      },
    });
    setSnackbar({ visible: true, message: 'Ürün sepete eklendi!', type: 'success' });
  };

  const handleBuyNow = () => {
    router.push(`/checkout?productId=${product.id}`);
  };

  const handleMakeOffer = () => {
    if (!isAuthenticated) {
      setSnackbar({ visible: true, message: 'Teklif vermek için giriş yapın', type: 'error' });
      setTimeout(() => router.push('/(auth)/login'), 1500);
      return;
    }
    if (product.seller?.id === user?.id) {
      setSnackbar({ visible: true, message: 'Kendi ürününüze teklif veremezsiniz', type: 'error' });
      return;
    }
    setOfferAmount('');
    setOfferMessage('');
    setShowOfferModal(true);
  };

  const submitOffer = async () => {
    const amount = parseFloat(offerAmount);
    if (!amount || amount <= 0) {
      Alert.alert('Uyarı', 'Geçerli bir teklif tutarı girin');
      return;
    }
    setOfferLoading(true);
    try {
      await offersApi.create({ productId: product.id, amount, message: offerMessage || undefined });
      queryClient.invalidateQueries({ queryKey: ['offers'] });
      setShowOfferModal(false);
      setSnackbar({ visible: true, message: 'Teklifiniz gönderildi!', type: 'success' });
    } catch (err: unknown) {
      Alert.alert('Hata', formatApiErrorMessage(err, 'Teklif gönderilemedi'));
    } finally {
      setOfferLoading(false);
    }
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
          setSnackbar({ visible: true, message: 'Favorilerden kaldırıldı', type: 'success' });
        } else {
          setSnackbar({ visible: true, message: 'Favorilerden kaldırılamadı', type: 'error' });
        }
      } else {
        const success = await addToFavorites(productId);
        if (success) {
          setIsFavorite(true);
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
      setTimeout(() => router.push('/(auth)/login'), 1500);
      return;
    }
    router.push(
      `/trade/new?listing=${id}&productId=${id}&targetSellerId=${product.seller?.id || ''}`,
    );
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

  /** Web listings/[id] ile aynı: müsait adet (rezerve düşülmüş) */
  const stockDisplay = (() => {
    const avail = product.availableQuantity;
    const qty = product.quantity;
    if (avail !== undefined && avail !== null) {
      if (avail <= 0) return 'Tükendi';
      return `${avail} adet`;
    }
    if (qty !== undefined && qty !== null) {
      if (qty <= 0) return 'Tükendi';
      return `${qty} adet`;
    }
    return 'Sınırsız';
  })();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleReport} style={styles.headerButton}>
            <Ionicons name="flag-outline" size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleShare} style={styles.headerButton}>
            <Ionicons name="share-outline" size={24} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={handleFavorite} 
            style={styles.headerButton}
            disabled={favoriteLoading}
          >
            {favoriteLoading ? (
              <ActivityIndicator size={20} color="#fff" />
            ) : (
              <Ionicons 
                name={isFavorite ? "heart" : "heart-outline"} 
                size={24} 
                color={isFavorite ? TarodanColors.error : "#fff"} 
              />
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
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
            const uri = typeof img === 'string' ? img : (img.detailUrl || img.cardUrl || img.url || img.imageUrl);
            return (
              <Image
                key={index}
                source={{ uri: transformImageUrl(uri) }}
                style={styles.productImage}
                resizeMode="contain"
              />
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
            {(product.tradeAvailable || product.trade_available || product.isTradeEnabled) && (
              <View style={[styles.badge, { backgroundColor: TarodanColors.accent }]}>
                <Ionicons name="swap-horizontal" size={14} color="#fff" />
                <Text style={styles.badgeText}>Takas Açık</Text>
              </View>
            )}
            <View style={[styles.badge, { backgroundColor: conditionInfo.color }]}>
              <Text style={styles.badgeText}>{conditionInfo.name}</Text>
            </View>
          </View>

          {/* Title & Price */}
          <Text style={styles.title}>{product.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={styles.price}>₺{getProductEffectivePrice(product).toLocaleString('tr-TR')}</Text>
            {isProductOnSaleDisplay(product) && (
              <Text style={{ fontSize: 16, color: TarodanColors.textSecondary, textDecorationLine: 'line-through' }}>
                ₺{getProductOriginalPriceForDisplay(product).toLocaleString('tr-TR')}
              </Text>
            )}
          </View>

          {/* Quick Info */}
          <View style={styles.quickInfo}>
            <View style={styles.quickInfoItem}>
              <Ionicons name="eye-outline" size={16} color={TarodanColors.textSecondary} />
              <Text style={styles.quickInfoText}>{product.viewCount || 0} görüntülenme</Text>
            </View>
            <View style={styles.quickInfoItem}>
              <Ionicons name="heart-outline" size={16} color={TarodanColors.textSecondary} />
              <Text style={styles.quickInfoText}>{product.favoriteCount || 0} favori</Text>
            </View>
            <View style={styles.quickInfoItem}>
              <Ionicons name="time-outline" size={16} color={TarodanColors.textSecondary} />
              <Text style={styles.quickInfoText}>
                {new Date(product.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
              </Text>
            </View>
          </View>

          <Divider style={styles.divider} />

          {/* Specifications */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Özellikler</Text>
            <View style={styles.specGrid}>
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>Marka</Text>
                <Text style={styles.specValue}>{safeString(product.brand)}</Text>
              </View>
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>Ölçek</Text>
                <Text style={styles.specValue}>{safeString(product.scale)}</Text>
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
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>Stok</Text>
                <Text style={styles.specValue}>{stockDisplay}</Text>
              </View>
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
                  <TouchableOpacity onPress={() => setShowAllDescription(!showAllDescription)}>
                    <Text style={styles.readMore}>
                      {showAllDescription ? 'Daha az göster' : 'Devamını oku'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              <Divider style={styles.divider} />
            </>
          )}

          {/* Seller */}
          <TouchableOpacity 
            style={styles.sellerCard}
            onPress={() => router.push(`/seller/${product.seller?.id}`)}
          >
            <Avatar.Text
              size={56}
              label={product.seller?.displayName?.substring(0, 2).toUpperCase() || 'S'}
              style={{ backgroundColor: TarodanColors.primary }}
            />
            <View style={styles.sellerInfo}>
              <View style={styles.sellerNameRow}>
                <Text style={styles.sellerName}>{product.seller?.displayName}</Text>
                {product.seller?.verified && (
                  <Ionicons name="checkmark-circle" size={18} color={TarodanColors.accent} />
                )}
              </View>
              <View style={styles.sellerStats}>
                <View style={styles.sellerStat}>
                  <Ionicons name="star" size={14} color={TarodanColors.star} />
                  <Text style={styles.sellerStatText}>{product.seller?.rating || 0}</Text>
                </View>
                <View style={styles.sellerStat}>
                  <Ionicons name="bag-check-outline" size={14} color={TarodanColors.textSecondary} />
                  <Text style={styles.sellerStatText}>{product.seller?.totalSales || 0} satış</Text>
                </View>
              </View>
              <Text style={styles.sellerResponseTime}>
                Yanıt süresi: {product.seller?.responseTime || 'Bilinmiyor'}
              </Text>
            </View>
            <View style={styles.sellerAction}>
              <TouchableOpacity style={styles.messageButton} onPress={handleMessage}>
                <Ionicons name="chatbubble-outline" size={20} color={TarodanColors.primary} />
              </TouchableOpacity>
              <Ionicons name="chevron-forward" size={20} color={TarodanColors.textSecondary} />
            </View>
          </TouchableOpacity>

          <Divider style={styles.divider} />

          {/* Reviews */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Değerlendirmeler</Text>
              <TouchableOpacity onPress={() => Alert.alert('Değerlendirmeler', 'Tüm değerlendirmeler bu üründe gösterilmektedir.')}>
                <Text style={styles.seeAll}>Tümünü Gör</Text>
              </TouchableOpacity>
            </View>

            {(Array.isArray(reviews) && reviews.length > 0 ? reviews : []).slice(0, 2).map((review: any) => (
              <View key={review.id} style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
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
                  </View>
                </View>
                <Text style={styles.reviewComment}>{review.comment}</Text>
                <Text style={styles.reviewDate}>
                  {new Date(review.date).toLocaleDateString('tr-TR')}
                </Text>
              </View>
            ))}

            {(!Array.isArray(reviews) || reviews.length === 0) && (
              <Text style={styles.noReviews}>Henüz değerlendirme yok</Text>
            )}
          </View>

          {/* Security Notice */}
          <View style={styles.securityNotice}>
            <Ionicons name="shield-checkmark" size={24} color={TarodanColors.accent} />
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
          <Text style={styles.bottomPriceValue}>₺{getProductEffectivePrice(product).toLocaleString('tr-TR')}</Text>
        </View>
        <View style={styles.bottomButtons}>
          {product.seller?.id !== user?.id && (
            <Button
              mode="outlined"
              onPress={handleMakeOffer}
              style={styles.tradeButton}
              labelStyle={styles.tradeButtonLabel}
              icon="tag-outline"
            >
              Teklif Ver
            </Button>
          )}
          {isProductTradeOpen(product as Record<string, unknown>) && (
            <Button
              mode="outlined"
              onPress={handleTrade}
              style={styles.tradeButton}
              labelStyle={styles.tradeButtonLabel}
              icon="swap-horizontal"
            >
              Takas
            </Button>
          )}
          <Button
            mode="contained"
            onPress={handleBuyNow}
            buttonColor={TarodanColors.primary}
            style={styles.cartButton}
            icon="flash"
          >
            Hemen Al
          </Button>
        </View>
      </View>

      <Portal>
        <Modal
          visible={showOfferModal}
          onDismiss={() => setShowOfferModal(false)}
          contentContainerStyle={{ backgroundColor: TarodanColors.background, margin: 20, padding: 20, borderRadius: 12 }}
        >
          <Text variant="titleLarge" style={{ marginBottom: 4, textAlign: 'center' }}>Teklif Ver</Text>
          <Text variant="bodySmall" style={{ textAlign: 'center', color: TarodanColors.textLight, marginBottom: 16 }}>
            Listelenen fiyat: ₺{Number(product?.price || 0).toLocaleString('tr-TR')}
          </Text>
          <PaperInput
            label="Teklif Tutarı (₺)"
            value={offerAmount}
            onChangeText={setOfferAmount}
            keyboardType="numeric"
            mode="outlined"
            textColor={TarodanColors.textPrimary}
            style={{ marginBottom: 12, backgroundColor: TarodanColors.background }}
            theme={{ colors: { onSurfaceVariant: TarodanColors.textSecondary, onSurface: TarodanColors.textPrimary } }}
          />
          <PaperInput
            label="Mesajınız (opsiyonel)"
            value={offerMessage}
            onChangeText={setOfferMessage}
            multiline
            numberOfLines={3}
            mode="outlined"
            textColor={TarodanColors.textPrimary}
            style={{ marginBottom: 16, backgroundColor: TarodanColors.background }}
            theme={{ colors: { onSurfaceVariant: TarodanColors.textSecondary, onSurface: TarodanColors.textPrimary } }}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
            <Button mode="outlined" onPress={() => setShowOfferModal(false)}>İptal</Button>
            <Button mode="contained" onPress={submitOffer} loading={offerLoading} disabled={offerLoading}>Gönder</Button>
          </View>
        </Modal>
      </Portal>

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ ...snackbar, visible: false })}
        duration={2000}
        style={{ backgroundColor: snackbar.type === 'success' ? TarodanColors.success : TarodanColors.error }}
        action={{
          label: snackbar.type === 'success' && snackbar.message.includes('sepet') ? 'Sepete Git' : undefined,
          onPress: () => router.push('/cart'),
        }}
      >
        {snackbar.message}
      </Snackbar>

      {showPrompt && promptType ? (
        <SignupPrompt
          visible
          onDismiss={() => {
            setShowPrompt(false);
            setPromptType(null);
          }}
          type={promptType}
        />
      ) : null}
    </View>
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
    marginTop: 16,
    color: TarodanColors.textSecondary,
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
    backgroundColor: 'rgba(0,0,0,0.3)',
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
    backgroundColor: TarodanColors.surfaceVariant,
  },
  imageIndicators: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: TarodanColors.background,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: TarodanColors.border,
    marginHorizontal: 4,
  },
  indicatorActive: {
    backgroundColor: TarodanColors.primary,
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
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    marginBottom: 8,
  },
  price: {
    fontSize: 28,
    fontWeight: 'bold',
    color: TarodanColors.primary,
    marginBottom: 12,
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
    color: TarodanColors.textSecondary,
  },
  divider: {
    marginVertical: 16,
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
    color: TarodanColors.textPrimary,
    marginBottom: 12,
  },
  seeAll: {
    fontSize: 14,
    color: TarodanColors.primary,
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
    color: TarodanColors.textSecondary,
    marginBottom: 2,
  },
  specValue: {
    fontSize: 15,
    fontWeight: '500',
    color: TarodanColors.textPrimary,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: TarodanColors.textPrimary,
  },
  readMore: {
    color: TarodanColors.primary,
    marginTop: 8,
    fontWeight: '500',
  },
  sellerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TarodanColors.surfaceVariant,
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
    color: TarodanColors.textPrimary,
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
    color: TarodanColors.textSecondary,
  },
  sellerResponseTime: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    marginTop: 4,
  },
  sellerAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  messageButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: TarodanColors.background,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: TarodanColors.primary,
  },
  reviewCard: {
    backgroundColor: TarodanColors.surfaceVariant,
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
    color: TarodanColors.textPrimary,
  },
  ratingStars: {
    flexDirection: 'row',
    gap: 2,
  },
  reviewComment: {
    fontSize: 14,
    color: TarodanColors.textPrimary,
    lineHeight: 20,
  },
  reviewDate: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    marginTop: 8,
  },
  noReviews: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
    fontStyle: 'italic',
  },
  securityNotice: {
    flexDirection: 'row',
    backgroundColor: '#E8F5E9',
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
    color: TarodanColors.success,
  },
  securityText: {
    fontSize: 13,
    color: '#388E3C',
    marginTop: 2,
  },
  bottomBar: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: TarodanColors.background,
    borderTopWidth: 1,
    borderTopColor: TarodanColors.border,
  },
  bottomPrice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  bottomPriceLabel: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
  },
  bottomPriceValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: TarodanColors.price,
  },
  bottomButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  tradeButton: {
    flex: 1,
    borderRadius: 10,
    borderColor: TarodanColors.primary,
    borderWidth: 1.5,
  },
  tradeButtonLabel: {
    color: TarodanColors.primary,
    fontSize: 13,
  },
  cartButton: {
    flex: 1,
    borderRadius: 10,
  },
});

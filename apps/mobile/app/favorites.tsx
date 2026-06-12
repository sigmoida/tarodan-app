import { View, ScrollView, StyleSheet, TouchableOpacity, Image, RefreshControl } from 'react-native';
import { useState, useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme, Text, Card, IconButton, Button, Spinner, Snackbar, ScreenHeader } from '@tarodan/ui-native';
import { useFavoritesStore, WishlistItem } from '../src/stores/favoritesStore';
import { useAuthStore } from '../src/stores/authStore';
import { useCartStore } from '../src/stores/cartStore';
import { getImageUrl as getImageUrlFromUtils } from '../src/utils/imageUrl';

const { colors } = theme;

export default function FavoritesScreen() {
  const { isAuthenticated } = useAuthStore();
  const { items, isLoading, error, fetchFavorites, removeFromFavorites, getFavoriteCount } = useFavoritesStore();
  const { addItem: addToCart, removeByProductId, isInCart } = useCartStore();
  const [refreshing, setRefreshing] = useState(false);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });

  // Fetch favorites on mount and focus
  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated) {
        fetchFavorites();
      }
    }, [isAuthenticated])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchFavorites();
    setRefreshing(false);
  };

  const handleRemove = async (productId: string) => {
    const success = await removeFromFavorites(productId);
    if (success) {
      setSnackbar({ visible: true, message: 'Favorilerden çıkarıldı' });
    } else {
      setSnackbar({ visible: true, message: 'Bir hata oluştu' });
    }
  };

  // Toggle: sepetteyse çıkar, değilse ekle (tekrar basınca adet artırmasın).
  const handleToggleCart = (item: WishlistItem) => {
    if (isInCart(item.productId)) {
      removeByProductId(item.productId);
      setSnackbar({ visible: true, message: 'Sepetten çıkarıldı' });
      return;
    }
    const product = item.product;
    addToCart({
      productId: product.id,
      title: product.title,
      price: product.price,
      imageUrl: getImageUrlFromUtils(product.images),
      seller: product.seller,
    });
    setSnackbar({ visible: true, message: 'Sepete eklendi' });
  };

  const getImageUrl = (product: WishlistItem['product']) => {
    return getImageUrlFromUtils(product.images);
  };

  const formatPrice = (price: number) => {
    return `₺${(price ?? 0).toLocaleString('tr-TR')}`;
  };

  // Not authenticated
  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Favorilerim" onBack={() => router.back()} />
        <View style={styles.centeredContainer}>
          <Ionicons name="heart-outline" size={64} color={colors.primary[600]!} />
          <Text variant="h2" style={styles.title}>Favorilerim</Text>
          <Text variant="body" style={styles.subtitle}>
            Favorilerinizi görmek için giriş yapın
          </Text>
          <Button variant="primary" title="Giriş Yap" onPress={() => router.push('/(auth)/login')} style={styles.button} />
          <Button variant="ghost" title="Hesap Oluştur" onPress={() => router.push('/(auth)/register')} style={{ alignSelf: 'center' }} />
        </View>
      </View>
    );
  }

  if (isLoading && items.length === 0) {
    return (
      <View style={styles.centeredContainer}>
        <Spinner size="lg" />
        <Text style={{ marginTop: 16 }}>Favoriler yükleniyor...</Text>
      </View>
    );
  }

  if (error && items.length === 0) {
    return (
      <View style={styles.centeredContainer}>
        <Ionicons name="cloud-offline-outline" size={64} color={colors.text.subtle} />
        <Text style={{ marginTop: 16, fontSize: 16, fontWeight: '600', color: colors.text.heading }}>Yüklenemedi</Text>
        <Text style={{ marginTop: 8, color: colors.text.subtle, textAlign: 'center' }}>Favorileriniz yüklenirken bir hata oluştu.</Text>
        <Button variant="primary" title="Tekrar Dene" onPress={() => fetchFavorites()} style={{ marginTop: 16, alignSelf: 'center' }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title={`Favorilerim (${getFavoriteCount()})`} onBack={() => router.back()} />

      {/* Content */}
      {items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="heart-outline" size={80} color={colors.text.subtle} />
          <Text variant="h3" style={styles.emptyTitle}>Henüz favori yok</Text>
          <Text variant="body" style={styles.emptySubtitle}>
            Beğendiğiniz ürünleri favorilere ekleyerek kolayca takip edin
          </Text>
          <Button variant="primary" title="Ürünleri Keşfet" onPress={() => router.push('/(tabs)/search')} style={styles.browseButton} />
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary[600]!]} />
          }
        >
          {items.map((item) => (
            <Card key={item.id} padding={0} style={styles.card}>
              {/* Aksiyon butonları navigasyon TouchableOpacity'sinin DIŞINDA (kardeş) —
                  iç içe dokunulabilirlerde ebeveyn dokunuşu yutabiliyor (sepet ekranı deseni). */}
              <View style={styles.cardContent}>
                <TouchableOpacity
                  style={styles.cardMain}
                  onPress={() => router.push(`/product/${item.productId}`)}
                >
                  <Image
                    source={{ uri: getImageUrl(item.product) }}
                    style={styles.productImage}
                  />
                  <View style={styles.productInfo}>
                    <Text variant="label" numberOfLines={2} style={styles.productTitle}>
                      {item.product.title}
                    </Text>
                    <Text variant="caption" style={styles.sellerName}>
                      {item.product.seller?.displayName || 'Satıcı'}
                    </Text>
                    <Text variant="h3" style={styles.price}>
                      {formatPrice(item.product.price)}
                    </Text>

                    {/* Status indicator */}
                    {item.product.status !== 'active' && (
                      <View style={[styles.statusBadge, { backgroundColor: colors.warning[50]! }]}>
                        <Text style={{ color: colors.warning[600]!, fontSize: 11 }}>
                          {item.product.status === 'sold' ? 'Satıldı' : 'Aktif değil'}
                        </Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>

                {/* Actions */}
                <View style={styles.actions}>
                  <IconButton
                    icon="heart"
                    accessibilityLabel="Favorilerden çıkar"
                    size="md"
                    color={colors.danger[600]!}
                    onPress={() => handleRemove(item.productId)}
                  />
                  {item.product.status === 'active' && (
                    <IconButton
                      icon={isInCart(item.productId) ? 'cart' : 'cart-outline'}
                      accessibilityLabel={isInCart(item.productId) ? 'Sepetten çıkar' : 'Sepete ekle'}
                      size="md"
                      color={colors.primary[600]!}
                      onPress={() => handleToggleCart(item)}
                    />
                  )}
                </View>
              </View>
            </Card>
          ))}

          {/* Recommendations Section */}
          <View style={styles.recommendationsSection}>
            <Text variant="h3" style={styles.sectionTitle}>Beğenebileceğiniz</Text>
            <Button variant="outline" title="Daha Fazla Ürün Keşfet" style={{ alignSelf: 'center' }} onPress={() => router.push('/(tabs)/search')} />
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* Snackbar */}
      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ ...snackbar, visible: false })}
        duration={2000}
        action={{
          label: 'Sepete Git',
          onPress: () => router.push('/cart'),
        }}
      >
        {snackbar.message}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: colors.surface.DEFAULT,
  },
  title: {
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 24,
    color: colors.text.muted,
  },
  button: {
    marginBottom: 8,
    minWidth: 200,
    // Button varsayılanı alignSelf:'flex-start' → ortalı kapsayıcıda sola kayar.
    alignSelf: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    marginTop: 16,
    marginBottom: 8,
    color: colors.text.heading,
  },
  emptySubtitle: {
    textAlign: 'center',
    marginBottom: 24,
    color: colors.text.muted,
    paddingHorizontal: 16,
  },
  browseButton: {
    minWidth: 200,
    alignSelf: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  card: {
    marginBottom: 12,
    backgroundColor: colors.surface.DEFAULT,
  },
  cardContent: {
    flexDirection: 'row',
    padding: 12,
  },
  cardMain: {
    flex: 1,
    flexDirection: 'row',
  },
  productImage: {
    width: 100,
    height: 100,
    borderRadius: 8,
    backgroundColor: colors.surface.alt,
  },
  productInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  productTitle: {
    color: colors.text.heading,
    marginBottom: 4,
  },
  sellerName: {
    color: colors.text.muted,
    marginBottom: 4,
  },
  price: {
    color: colors.primary[600]!,
    fontWeight: 'bold',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  actions: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  recommendationsSection: {
    marginTop: 24,
    width: '100%',
    alignItems: 'center',
  },
  sectionTitle: {
    marginBottom: 12,
    color: colors.text.heading,
  },
});

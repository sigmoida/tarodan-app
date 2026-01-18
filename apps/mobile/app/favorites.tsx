import { View, ScrollView, StyleSheet, TouchableOpacity, Image, RefreshControl } from 'react-native';
import { Text, Card, IconButton, Button, ActivityIndicator, Snackbar, FAB } from 'react-native-paper';
import { useState, useCallback, useEffect } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFavoritesStore, WishlistItem } from '../src/stores/favoritesStore';
import { useAuthStore } from '../src/stores/authStore';
import { useCartStore } from '../src/stores/cartStore';
import { TarodanColors } from '../src/theme';

export default function FavoritesScreen() {
  const { isAuthenticated } = useAuthStore();
  const { items, isLoading, error, fetchFavorites, removeFromFavorites, getFavoriteCount } = useFavoritesStore();
  const { addItem: addToCart } = useCartStore();
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

  const handleAddToCart = (item: WishlistItem) => {
    const product = item.product;
    addToCart({
      productId: product.id,
      title: product.title,
      price: product.price,
      imageUrl: product.images?.[0]?.url || '',
      seller: product.seller,
    });
    setSnackbar({ visible: true, message: 'Sepete eklendi' });
  };

  const getImageUrl = (product: WishlistItem['product']) => {
    if (product.images && product.images.length > 0) {
      return product.images[0].url;
    }
    return 'https://via.placeholder.com/150x150?text=No+Image';
  };

  const formatPrice = (price: number) => {
    return `₺${price.toLocaleString('tr-TR')}`;
  };

  // Not authenticated
  if (!isAuthenticated) {
    return (
      <View style={styles.centeredContainer}>
        <Ionicons name="heart-outline" size={64} color={TarodanColors.primary} />
        <Text variant="titleLarge" style={styles.title}>Favorilerim</Text>
        <Text variant="bodyMedium" style={styles.subtitle}>
          Favorilerinizi görmek için giriş yapın
        </Text>
        <Button mode="contained" onPress={() => router.push('/(auth)/login')} style={styles.button}>
          Giriş Yap
        </Button>
        <Button mode="text" onPress={() => router.push('/(auth)/register')}>
          Hesap Oluştur
        </Button>
      </View>
    );
  }

  // Loading state
  if (isLoading && items.length === 0) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color={TarodanColors.primary} />
        <Text style={{ marginTop: 16 }}>Favoriler yükleniyor...</Text>
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
        <Text style={styles.headerTitle}>Favorilerim ({getFavoriteCount()})</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Content */}
      {items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="heart-outline" size={80} color={TarodanColors.textLight} />
          <Text variant="titleMedium" style={styles.emptyTitle}>Henüz favori yok</Text>
          <Text variant="bodyMedium" style={styles.emptySubtitle}>
            Beğendiğiniz ürünleri favorilere ekleyerek kolayca takip edin
          </Text>
          <Button mode="contained" onPress={() => router.push('/(tabs)/search')} style={styles.browseButton}>
            Ürünleri Keşfet
          </Button>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[TarodanColors.primary]} />
          }
        >
          {items.map((item) => (
            <Card key={item.id} style={styles.card}>
              <TouchableOpacity 
                style={styles.cardContent}
                onPress={() => router.push(`/product/${item.productId}`)}
              >
                <Image 
                  source={{ uri: getImageUrl(item.product) }} 
                  style={styles.productImage}
                />
                <View style={styles.productInfo}>
                  <Text variant="titleSmall" numberOfLines={2} style={styles.productTitle}>
                    {item.product.title}
                  </Text>
                  <Text variant="bodySmall" style={styles.sellerName}>
                    {item.product.seller?.displayName || 'Satıcı'}
                  </Text>
                  <Text variant="titleMedium" style={styles.price}>
                    {formatPrice(item.product.price)}
                  </Text>
                  
                  {/* Status indicator */}
                  {item.product.status !== 'active' && (
                    <View style={[styles.statusBadge, { backgroundColor: TarodanColors.warning + '20' }]}>
                      <Text style={{ color: TarodanColors.warning, fontSize: 11 }}>
                        {item.product.status === 'sold' ? 'Satıldı' : 'Aktif değil'}
                      </Text>
                    </View>
                  )}
                </View>
                
                {/* Actions */}
                <View style={styles.actions}>
                  <IconButton
                    icon="heart"
                    iconColor={TarodanColors.error}
                    size={24}
                    onPress={() => handleRemove(item.productId)}
                  />
                  {item.product.status === 'active' && (
                    <IconButton
                      icon="cart-plus"
                      iconColor={TarodanColors.primary}
                      size={24}
                      onPress={() => handleAddToCart(item)}
                    />
                  )}
                </View>
              </TouchableOpacity>
            </Card>
          ))}

          {/* Recommendations Section */}
          <View style={styles.recommendationsSection}>
            <Text variant="titleMedium" style={styles.sectionTitle}>Beğenebileceğiniz</Text>
            <Button mode="outlined" onPress={() => router.push('/(tabs)/search')}>
              Daha Fazla Ürün Keşfet
            </Button>
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
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: TarodanColors.background,
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
  title: {
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 24,
    color: TarodanColors.textSecondary,
  },
  button: {
    marginBottom: 8,
    minWidth: 200,
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
    color: TarodanColors.textPrimary,
  },
  emptySubtitle: {
    textAlign: 'center',
    marginBottom: 24,
    color: TarodanColors.textSecondary,
    paddingHorizontal: 16,
  },
  browseButton: {
    minWidth: 200,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  card: {
    marginBottom: 12,
    backgroundColor: TarodanColors.background,
  },
  cardContent: {
    flexDirection: 'row',
    padding: 12,
  },
  productImage: {
    width: 100,
    height: 100,
    borderRadius: 8,
    backgroundColor: TarodanColors.surfaceVariant,
  },
  productInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  productTitle: {
    color: TarodanColors.textPrimary,
    marginBottom: 4,
  },
  sellerName: {
    color: TarodanColors.textSecondary,
    marginBottom: 4,
  },
  price: {
    color: TarodanColors.primary,
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
    alignItems: 'center',
  },
  sectionTitle: {
    marginBottom: 12,
    color: TarodanColors.textPrimary,
  },
});

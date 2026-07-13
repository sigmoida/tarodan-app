import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useFavorites, type WishlistItem } from '@/hooks/useFavorites';
import { useAuthStore } from '@/stores/authStore';
import { useCartStore } from '@/stores/cartStore';
import { getImageUrl as getImageUrlFromUtils } from '@/utils/imageUrl';

/**
 * Favorites-screen controller — wraps the useFavorites + cartStore hooks with
 * the screen's focus fetch, remove, cart-toggle and snackbar. Lifted verbatim
 * from the monolithic screen (§12).
 */
export function useFavoritesScreen() {
  const { isAuthenticated } = useAuthStore();
  const { items, isLoading, error, fetchFavorites, removeFromFavorites, getFavoriteCount } = useFavorites();
  const { addItem: addToCart, removeByProductId, isInCart } = useCartStore();
  const [refreshing, setRefreshing] = useState(false);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });

  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated) {
        fetchFavorites();
      }
    }, [isAuthenticated]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchFavorites();
    setRefreshing(false);
  };

  const handleRemove = async (productId: string) => {
    const success = await removeFromFavorites(productId);
    setSnackbar({
      visible: true,
      message: success ? 'Favorilerden çıkarıldı' : 'Bir hata oluştu',
    });
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

  const formatPrice = (price: number) => `₺${(price ?? 0).toLocaleString('tr-TR')}`;

  return {
    isAuthenticated,
    items,
    isLoading,
    error,
    fetchFavorites,
    getFavoriteCount,
    isInCart,
    refreshing,
    onRefresh,
    handleRemove,
    handleToggleCart,
    formatPrice,
    snackbar,
    setSnackbar,
  };
}

export type FavoritesScreenController = ReturnType<typeof useFavoritesScreen>;

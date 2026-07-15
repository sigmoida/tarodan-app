import { View, TouchableOpacity } from 'react-native';
import { Text, Card, IconButton, theme } from '@tarodan/ui-native';
import { router } from 'expo-router';
import { AppImage } from '@/components/AppImage';
import type { WishlistItem } from '@/hooks/useFavorites';
import { styles } from '../_lib/styles';
import type { FavoritesScreenController } from '../_hooks/useFavoritesScreen';

const { colors } = theme;

/** Tek favori ürün kartı — foto/başlık/fiyat/durum + kalp/sepet aksiyonları. */
export function FavoriteCard({ item, f }: { item: WishlistItem; f: FavoritesScreenController }) {
  return (
    <Card padding={0} style={styles.card}>
      {/* Aksiyon butonları navigasyon TouchableOpacity'sinin DIŞINDA (kardeş) —
          iç içe dokunulabilirlerde ebeveyn dokunuşu yutabiliyor (sepet ekranı deseni). */}
      <View style={styles.cardContent}>
        <TouchableOpacity style={styles.cardMain} onPress={() => router.push(`/product/${item.productId}`)}>
          <AppImage source={item.product.images} variant="card" style={styles.productImage} />
          <View style={styles.productInfo}>
            <Text variant="label" numberOfLines={2} style={styles.productTitle}>{item.product.title}</Text>
            <Text variant="caption" style={styles.sellerName}>
              {item.product.seller?.displayName || 'Satıcı'}
            </Text>
            <Text variant="h3" style={styles.price}>{f.formatPrice(item.product.price)}</Text>

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
            onPress={() => f.handleRemove(item.productId)}
          />
          {item.product.status === 'active' && (
            <IconButton
              icon={f.isInCart(item.productId) ? 'cart' : 'cart-outline'}
              accessibilityLabel={f.isInCart(item.productId) ? 'Sepetten çıkar' : 'Sepete ekle'}
              size="md"
              color={colors.primary[600]!}
              onPress={() => f.handleToggleCart(item)}
            />
          )}
        </View>
      </View>
    </Card>
  );
}

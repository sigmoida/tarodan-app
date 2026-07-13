import { View, Image, TouchableOpacity } from 'react-native';
import { IconButton, Text, theme } from '@tarodan/ui-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { maxAllowedQty } from '@/stores/cartStore';
import { transformImageUrl } from '@/utils/imageUrl';
import { asLabel } from '@/utils/format';
import { styles } from '../_lib/styles';
import type { CartController } from '../_hooks/useCart';

const { colors } = theme;

/** Tek sepet satırı — foto/başlık/fiyat + kaldır + adet kontrolü (stok sınırı). */
export function CartItemRow({ item, f }: { item: any; f: CartController }) {
  const itemMax = maxAllowedQty(item);
  const atMax = item.quantity >= itemMax;
  const stockKnown = item.stock != null;

  return (
    <View testID="cart-item-row" style={styles.cartItem}>
      <TouchableOpacity onPress={() => router.push(`/product/${item.productId}`)}>
        <Image
          source={{ uri: transformImageUrl(item.imageUrl) || 'https://placehold.co/100x100/f3f4f6/9ca3af?text=Ürün' }}
          style={styles.itemImage}
        />
      </TouchableOpacity>
      <View style={styles.itemInfo}>
        <TouchableOpacity onPress={() => router.push(`/product/${item.productId}`)}>
          <Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>
        </TouchableOpacity>
        <Text style={styles.itemMeta}>{asLabel(item.brand, 'Marka')} • {asLabel(item.scale, '1:64')}</Text>
        <Text style={styles.itemSeller}>Satıcı: {item.seller.displayName}</Text>
        <Text style={styles.itemPrice}>₺{item.price.toLocaleString('tr-TR')}</Text>
      </View>
      <View style={styles.itemActions}>
        <IconButton
          icon="trash-outline"
          accessibilityLabel="Ürünü sepetten kaldır"
          size="md"
          onPress={() => f.handleRemove(item.id)}
        />
        <View style={styles.quantityControl}>
          <TouchableOpacity
            style={styles.quantityButton}
            onPress={() => f.handleQuantityChange(item.id, -1)}
            accessibilityRole="button"
            accessibilityLabel="Adedi azalt"
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons name="remove" size={16} color={colors.text.heading} />
          </TouchableOpacity>
          <Text style={styles.quantityText}>{item.quantity}</Text>
          <TouchableOpacity
            style={[styles.quantityButton, atMax && styles.quantityButtonDisabled]}
            disabled={atMax}
            onPress={() => f.handleQuantityChange(item.id, 1)}
            accessibilityRole="button"
            accessibilityLabel="Adedi artır"
            accessibilityState={{ disabled: atMax }}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons name="add" size={16} color={atMax ? colors.text.muted : colors.text.heading} />
          </TouchableOpacity>
        </View>
        {stockKnown && atMax ? <Text style={styles.stockHint}>Son {itemMax} adet</Text> : null}
      </View>
    </View>
  );
}

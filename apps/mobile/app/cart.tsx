import { useEffect } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Text, Button, IconButton, Divider } from 'react-native-paper';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TarodanColors } from '../src/theme';
import { useCartStore } from '../src/stores/cartStore';

export default function CartScreen() {
  const { items, getSubtotal, getItemCount, removeItem, updateQuantity, cleanExpiredItems } = useCartStore();
  
  // Clean expired items on mount
  useEffect(() => {
    cleanExpiredItems();
  }, []);

  const subtotal = getSubtotal();
  const shipping = items.length > 0 ? 49.90 : 0;
  const total = subtotal + shipping;
  const itemCount = getItemCount();

  const handleRemove = (itemId: string) => {
    removeItem(itemId);
  };

  const handleQuantityChange = (itemId: string, delta: number) => {
    const item = items.find(i => i.id === itemId);
    if (item) {
      updateQuantity(itemId, item.quantity + delta);
    }
  };

  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Sepetim</Text>
          <View style={{ width: 24 }} />
        </View>
        
        <View style={styles.emptyContent}>
          <Ionicons name="cart-outline" size={80} color={TarodanColors.textSecondary} />
          <Text style={styles.emptyTitle}>Sepetiniz Boş</Text>
          <Text style={styles.emptySubtitle}>
            İlanlara göz atın ve beğendiklerinizi sepete ekleyin
          </Text>
          <Button
            mode="contained"
            buttonColor={TarodanColors.primary}
            onPress={() => router.replace('/')}
            style={{ marginTop: 24 }}
          >
            İlanlara Göz At
          </Button>
        </View>
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
        <Text style={styles.headerTitle}>Sepetim ({itemCount})</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Expiry Notice */}
      <View style={styles.expiryNotice}>
        <Ionicons name="time-outline" size={16} color={TarodanColors.warning} />
        <Text style={styles.expiryText}>
          Sepetinizdeki ürünler 24 saat sonra otomatik olarak silinir
        </Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Cart Items */}
        {items.map((item) => (
          <View key={item.id} style={styles.cartItem}>
            <TouchableOpacity onPress={() => router.push(`/product/${item.productId}`)}>
              <Image 
                source={{ uri: item.imageUrl || 'https://placehold.co/100x100/f3f4f6/9ca3af?text=Ürün' }} 
                style={styles.itemImage} 
              />
            </TouchableOpacity>
            <View style={styles.itemInfo}>
              <TouchableOpacity onPress={() => router.push(`/product/${item.productId}`)}>
                <Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>
              </TouchableOpacity>
              <Text style={styles.itemMeta}>{item.brand || 'Marka'} • {item.scale || '1:64'}</Text>
              <Text style={styles.itemSeller}>Satıcı: {item.seller.displayName}</Text>
              <Text style={styles.itemPrice}>₺{item.price.toLocaleString('tr-TR')}</Text>
            </View>
            <View style={styles.itemActions}>
              <IconButton
                icon="trash-can-outline"
                size={20}
                iconColor={TarodanColors.error}
                onPress={() => handleRemove(item.id)}
              />
              <View style={styles.quantityControl}>
                <TouchableOpacity 
                  style={styles.quantityButton}
                  onPress={() => handleQuantityChange(item.id, -1)}
                >
                  <Ionicons name="remove" size={16} color={TarodanColors.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.quantityText}>{item.quantity}</Text>
                <TouchableOpacity 
                  style={styles.quantityButton}
                  onPress={() => handleQuantityChange(item.id, 1)}
                >
                  <Ionicons name="add" size={16} color={TarodanColors.textPrimary} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))}

        {/* Order Summary */}
        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>Sipariş Özeti</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Ara Toplam ({itemCount} ürün)</Text>
            <Text style={styles.summaryValue}>₺{subtotal.toLocaleString('tr-TR')}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Tahmini Kargo</Text>
            <Text style={styles.summaryValue}>₺{shipping.toFixed(2)}</Text>
          </View>
          <Divider style={{ marginVertical: 12 }} />
          <View style={styles.summaryRow}>
            <Text style={styles.totalLabel}>Toplam</Text>
            <Text style={styles.totalValue}>₺{total.toLocaleString('tr-TR')}</Text>
          </View>
        </View>

        {/* Guest Checkout Info */}
        <View style={styles.guestInfo}>
          <Ionicons name="information-circle-outline" size={20} color={TarodanColors.info} />
          <Text style={styles.guestInfoText}>
            Üye olmadan da alışveriş yapabilirsiniz. Siparişinizi e-posta ile takip edebilirsiniz.
          </Text>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Checkout Button */}
      <View style={styles.checkoutBar}>
        <View style={styles.checkoutTotal}>
          <Text style={styles.checkoutLabel}>Toplam</Text>
          <Text style={styles.checkoutPrice}>₺{total.toLocaleString('tr-TR')}</Text>
        </View>
        <Button
          mode="contained"
          style={styles.checkoutButton}
          buttonColor={TarodanColors.primary}
          onPress={() => router.push('/checkout')}
        >
          Satın Al
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  emptyContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
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
  expiryNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E1',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: TarodanColors.border,
  },
  expiryText: {
    flex: 1,
    fontSize: 12,
    color: '#F57C00',
    marginLeft: 8,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  cartItem: {
    backgroundColor: TarodanColors.background,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  itemImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: TarodanColors.surfaceVariant,
  },
  itemInfo: {
    flex: 1,
    marginLeft: 12,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
  },
  itemMeta: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    marginTop: 2,
  },
  itemSeller: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    marginTop: 2,
  },
  itemPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: TarodanColors.primary,
    marginTop: 8,
  },
  itemActions: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TarodanColors.surfaceVariant,
    borderRadius: 8,
    padding: 4,
  },
  quantityButton: {
    padding: 8,
  },
  quantityText: {
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 12,
    color: TarodanColors.textPrimary,
  },
  summary: {
    backgroundColor: TarodanColors.background,
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
  },
  summaryValue: {
    fontSize: 14,
    color: TarodanColors.textPrimary,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TarodanColors.primary,
  },
  guestInfo: {
    flexDirection: 'row',
    backgroundColor: '#E3F2FD',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  guestInfoText: {
    flex: 1,
    fontSize: 13,
    color: '#1565C0',
    marginLeft: 8,
  },
  checkoutBar: {
    backgroundColor: TarodanColors.background,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: TarodanColors.border,
  },
  checkoutTotal: {
    flex: 1,
  },
  checkoutLabel: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
  },
  checkoutPrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
  },
  checkoutButton: {
    borderRadius: 12,
    paddingHorizontal: 24,
  },
});

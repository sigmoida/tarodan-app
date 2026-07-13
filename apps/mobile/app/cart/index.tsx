import { View, ScrollView } from 'react-native';
import { Button, Text, theme, ScreenHeader } from '@tarodan/ui-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCart } from './_hooks/useCart';
import { styles } from './_lib/styles';
import { CartItemRow } from './_components/CartItemRow';
import { CartSummary } from './_components/CartSummary';

const { colors } = theme;

export default function CartScreen() {
  const f = useCart();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

  if (f.items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <ScreenHeader title="Sepetim" onBack={back} />
        <View style={styles.emptyContent}>
          <Ionicons name="cart-outline" size={80} color={colors.text.muted} />
          <Text style={styles.emptyTitle}>Sepetiniz Boş</Text>
          <Text style={styles.emptySubtitle}>İlanlara göz atın ve beğendiklerinizi sepete ekleyin</Text>
          <Button
            variant="primary"
            title="İlanlara Göz At"
            onPress={() => router.replace('/')}
            style={{ marginTop: 24, alignSelf: 'center' }}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title={`Sepetim (${f.itemCount})`} onBack={back} />

      {/* Expiry Notice */}
      <View style={styles.expiryNotice}>
        <Ionicons name="time-outline" size={16} color={colors.warning[600]!} />
        <Text style={styles.expiryText}>Sepetinizdeki ürünler 24 saat sonra otomatik olarak silinir</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {f.items.map((item) => (
          <CartItemRow key={item.id} item={item} f={f} />
        ))}

        <CartSummary f={f} />

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Checkout Button */}
      <View style={styles.checkoutBar}>
        <View style={styles.checkoutTotal}>
          <Text style={styles.checkoutLabel}>Toplam</Text>
          <Text style={styles.checkoutPrice}>₺{f.total.toLocaleString('tr-TR')}</Text>
        </View>
        <Button
          testID="cart-checkout-button"
          variant="primary"
          title="Satın Al"
          style={styles.checkoutButton}
          onPress={() => router.push('/checkout')}
        />
      </View>
    </View>
  );
}

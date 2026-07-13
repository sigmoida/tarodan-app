import { View } from 'react-native';
import { Divider, Text, theme } from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from '../_lib/styles';
import type { CartController } from '../_hooks/useCart';

const { colors } = theme;

/** Sipariş özeti kartı + (misafir ise) misafir-checkout bilgisi. */
export function CartSummary({ f }: { f: CartController }) {
  return (
    <>
      <View style={styles.summary}>
        <Text style={styles.summaryTitle}>Sipariş Özeti</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Ara Toplam ({f.itemCount} ürün)</Text>
          <Text style={styles.summaryValue}>₺{f.subtotal.toLocaleString('tr-TR')}</Text>
        </View>
        {f.buyerFee > 0 ? (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Platform Hizmet Bedeli</Text>
            <Text style={styles.summaryValue}>₺{f.buyerFee.toLocaleString('tr-TR')}</Text>
          </View>
        ) : null}
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Kargo</Text>
          <Text style={styles.summaryValue}>Ödeme adımında hesaplanır</Text>
        </View>
        <Divider style={{ marginVertical: 12 }} />
        <View style={styles.summaryRow}>
          <Text style={styles.totalLabel}>Toplam</Text>
          <Text style={styles.totalValue}>₺{f.total.toLocaleString('tr-TR')}</Text>
        </View>
      </View>

      {/* Guest Checkout Info — yalnızca giriş yapmamış kullanıcılara göster */}
      {!f.isAuthenticated && (
        <View style={styles.guestInfo}>
          <Ionicons name="information-circle-outline" size={20} color={colors.info[600]!} />
          <Text style={styles.guestInfoText}>
            Üye olmadan da alışveriş yapabilirsiniz. Siparişinizi e-posta ile takip edebilirsiniz.
          </Text>
        </View>
      )}
    </>
  );
}

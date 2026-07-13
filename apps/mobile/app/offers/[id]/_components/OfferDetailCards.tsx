import { View, Image, Pressable } from 'react-native';
import { Text, theme } from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { formatPrice, formatOfferStatus, formatRelativeDate } from '@/utils/format';
import { transformImageUrl } from '@/utils/imageUrl';
import { styles } from '../_lib/styles';
import type { OfferDetailController } from '../_hooks/useOfferDetail';

const { colors } = theme;

/** Ürün + statü + tutar + mesaj + taraflar kartları (detay gövdesi). */
export function OfferDetailCards({ f }: { f: OfferDetailController }) {
  const { offer, firstImg, color } = f;
  if (!offer || !color) return null;

  return (
    <>
      {/* Product */}
      <Pressable
        style={({ pressed }) => [styles.productCard, pressed && { opacity: 0.85 }]}
        onPress={() => offer.product?.id && router.push(`/product/${offer.product.id}`)}
      >
        <Image source={{ uri: transformImageUrl(firstImg) }} style={styles.productImage} />
        <View style={styles.productBody}>
          <Text style={styles.productTitle} numberOfLines={2}>
            {offer.product?.title || 'Ürün'}
          </Text>
          {offer.product?.price ? (
            <Text style={styles.listPrice}>Liste fiyatı: {formatPrice(offer.product.price)}</Text>
          ) : null}
        </View>
      </Pressable>

      {/* Status */}
      <View style={[styles.statusBanner, { backgroundColor: color.bg }]}>
        <Ionicons name="information-circle" size={18} color={color.fg} />
        <Text style={[styles.statusBannerText, { color: color.fg }]}>
          {formatOfferStatus(offer.status)}
        </Text>
      </View>

      {/* Amount */}
      <View style={styles.amountCard}>
        <Text style={styles.amountLabel}>Teklif Tutarı</Text>
        <Text style={styles.amountValue}>{formatPrice(offer.amount)}</Text>
        {offer.counterAmount ? (
          <>
            <View style={styles.divider} />
            <Text style={styles.amountLabel}>Karşı Teklif</Text>
            <Text style={styles.counterValue}>{formatPrice(offer.counterAmount)}</Text>
          </>
        ) : null}
      </View>

      {/* Message */}
      {offer.message ? (
        <View style={styles.messageCard}>
          <Text style={styles.sectionTitle}>Mesaj</Text>
          <Text style={styles.messageText}>{offer.message}</Text>
        </View>
      ) : null}

      {/* Parties */}
      <View style={styles.partyCard}>
        <View style={styles.partyRow}>
          <Ionicons name="person-circle-outline" size={18} color={colors.text.muted} />
          <Text style={styles.partyLabel}>Alıcı:</Text>
          <Text style={styles.partyName}>{offer.buyer?.displayName || '—'}</Text>
        </View>
        <View style={styles.partyRow}>
          <Ionicons name="person-circle-outline" size={18} color={colors.text.muted} />
          <Text style={styles.partyLabel}>Satıcı:</Text>
          <Text style={styles.partyName}>{offer.seller?.displayName || '—'}</Text>
        </View>
        <View style={styles.partyRow}>
          <Ionicons name="time-outline" size={18} color={colors.text.muted} />
          <Text style={styles.partyLabel}>Oluşturuldu:</Text>
          <Text style={styles.partyName}>{formatRelativeDate(offer.createdAt)}</Text>
        </View>
      </View>
    </>
  );
}

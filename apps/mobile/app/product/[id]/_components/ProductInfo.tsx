import React, { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Divider, Text, theme } from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';
import { asLabel } from '@/utils/format';
import { isProductTradeOpen } from '@/utils/isProductTradeOpen';
import { getConditionInfo, type PriceInfo } from '../_lib/display';
import type { Product } from '../_lib/types';

const { colors } = theme;

export interface ProductInfoActions {
  onTrade: () => void;
  onMakeOffer: () => void;
  onAddToCollection: () => void;
  onMessage: () => void;
  onShare: () => void;
}

/** Kaydırılabilir orta içerik: rozetler → başlık/fiyat → puan → hızlı bilgi →
 * aksiyon grid → özellikler → açıklama. */
export function ProductInfo({
  product,
  isOwner,
  favoriteCount,
  price,
  actions,
  onOpenReviews,
}: {
  product: Product;
  isOwner: boolean;
  favoriteCount: number;
  price: PriceInfo;
  actions: ProductInfoActions;
  onOpenReviews: () => void;
}) {
  const [showAllDescription, setShowAllDescription] = useState(false);
  const conditionInfo = getConditionInfo(product.condition ?? '');
  const tradeOpen = isProductTradeOpen(product);

  return (
    <>
      {/* Badges */}
      <View style={styles.badgeRow}>
        {tradeOpen && (
          <View style={[styles.badge, { backgroundColor: colors.success[500]! }]}>
            <Ionicons name="swap-horizontal" size={14} color={colors.white} />
            <Text style={[styles.badgeText, { marginLeft: theme.spacing[1] }]} numberOfLines={1}>
              Takas Açık
            </Text>
          </View>
        )}
        <View style={[styles.badge, { backgroundColor: conditionInfo.color }]}>
          <Text style={styles.badgeText}>{conditionInfo.name}</Text>
        </View>
      </View>

      {/* Title & Price */}
      <Text style={styles.title}>{product.title}</Text>
      <View style={styles.priceRow}>
        <Text style={styles.price}>₺{price.effectivePrice.toLocaleString('tr-TR')}</Text>
        {price.onSale ? (
          <>
            <Text style={styles.priceOld}>₺{price.originalPrice.toLocaleString('tr-TR')}</Text>
            {price.discountPct > 0 ? (
              <View style={styles.discountBadge}>
                <Text style={styles.discountBadgeText}>%{price.discountPct}</Text>
              </View>
            ) : null}
          </>
        ) : null}
      </View>

      {/* Ürün puanı */}
      {product.rating?.average != null && (product.rating?.count ?? 0) > 0 ? (
        <Pressable style={styles.headerRatingRow} onPress={onOpenReviews}>
          <Ionicons name="star" size={16} color={colors.warning[500]!} />
          <Text style={styles.headerRatingValue}>{Number(product.rating.average).toFixed(1)}</Text>
          <Text style={styles.headerRatingCount}>({product.rating.count} değerlendirme)</Text>
        </Pressable>
      ) : null}

      {/* Quick Info */}
      <View style={styles.quickInfo}>
        <View style={styles.quickInfoItem}>
          <Ionicons name="eye-outline" size={16} color={colors.text.muted} />
          <Text style={styles.quickInfoText}>{product.viewCount || 0} görüntülenme</Text>
        </View>
        <View style={styles.quickInfoItem}>
          <Ionicons name="heart-outline" size={16} color={colors.text.muted} />
          <Text style={styles.quickInfoText}>{favoriteCount} favori</Text>
        </View>
        <View style={styles.quickInfoItem}>
          <Ionicons name="time-outline" size={16} color={colors.text.muted} />
          <Text style={styles.quickInfoText}>
            {product.createdAt
              ? new Date(product.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
              : ''}
          </Text>
        </View>
      </View>

      {/* Sahip için stok/rezervasyon dökümü */}
      {isOwner &&
      product.quantity != null &&
      product.availableQuantity != null &&
      product.quantity - product.availableQuantity > 0 ? (
        <View style={styles.reservedInfoBox}>
          <Ionicons name="lock-closed-outline" size={16} color={colors.warning[700]!} />
          <Text style={styles.reservedInfoText}>
            Stok: {product.quantity} · {product.quantity - product.availableQuantity} adedi aktif takas/sipariş
            için rezerve · Satışta görünen: {product.availableQuantity}
          </Text>
        </View>
      ) : null}

      <Divider style={styles.divider} />

      {/* Aksiyon Bar — sahibine göre değişir. */}
      <View style={styles.actionGrid}>
        {!isOwner && tradeOpen ? (
          <Pressable style={styles.actionItem} onPress={actions.onTrade}>
            <View style={styles.actionIconWrap}>
              <Ionicons name="swap-horizontal" size={22} color={colors.primary[700]!} />
            </View>
            <Text style={styles.actionLabel} numberOfLines={1}>Takas</Text>
          </Pressable>
        ) : null}

        {!isOwner && (
          <Pressable style={styles.actionItem} onPress={actions.onMakeOffer}>
            <View style={styles.actionIconWrap}>
              <Ionicons name="pricetag-outline" size={22} color={colors.primary[700]!} />
            </View>
            <Text style={styles.actionLabel} numberOfLines={1}>Teklif Ver</Text>
          </Pressable>
        )}

        {isOwner && (
          <Pressable style={styles.actionItem} onPress={actions.onAddToCollection}>
            <View style={styles.actionIconWrap}>
              <Ionicons name="albums-outline" size={22} color={colors.primary[700]!} />
            </View>
            <Text style={styles.actionLabel} numberOfLines={1}>Koleksiyon</Text>
          </Pressable>
        )}

        {!isOwner && (
          <Pressable style={styles.actionItem} onPress={actions.onMessage}>
            <View style={styles.actionIconWrap}>
              <Ionicons name="chatbubble-outline" size={22} color={colors.primary[700]!} />
            </View>
            <Text style={styles.actionLabel} numberOfLines={1}>Mesaj</Text>
          </Pressable>
        )}

        <Pressable style={styles.actionItem} onPress={actions.onShare}>
          <View style={styles.actionIconWrap}>
            <Ionicons name="share-social-outline" size={22} color={colors.primary[700]!} />
          </View>
          <Text style={styles.actionLabel} numberOfLines={1}>Paylaş</Text>
        </Pressable>
      </View>

      <Divider style={styles.divider} />

      {/* Specifications */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Özellikler</Text>
        <View style={styles.specGrid}>
          {asLabel(product.brand) ? (
            <View style={styles.specItem}>
              <Text style={styles.specLabel}>Marka</Text>
              <Text style={styles.specValue}>{asLabel(product.brand)}</Text>
            </View>
          ) : null}
          {asLabel(product.scale) ? (
            <View style={styles.specItem}>
              <Text style={styles.specLabel}>Ölçek</Text>
              <Text style={styles.specValue}>{asLabel(product.scale)}</Text>
            </View>
          ) : null}
          <View style={styles.specItem}>
            <Text style={styles.specLabel}>Durum</Text>
            <Text style={[styles.specValue, { color: conditionInfo.color }]}>{conditionInfo.name}</Text>
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
        </View>
      </View>

      <Divider style={styles.divider} />

      {/* Description */}
      {product.description && (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Açıklama</Text>
            <Text style={styles.description} numberOfLines={showAllDescription ? undefined : 4}>
              {product.description}
            </Text>
            {product.description.length > 200 && (
              <Pressable onPress={() => setShowAllDescription(!showAllDescription)}>
                <Text style={styles.readMore}>{showAllDescription ? 'Daha az göster' : 'Devamını oku'}</Text>
              </Pressable>
            )}
          </View>
          <Divider style={styles.divider} />
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  badgeRow: { flexDirection: 'row', gap: theme.spacing[2], marginBottom: theme.spacing[3] },
  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: theme.spacing[2.5], paddingVertical: theme.spacing[1.5], borderRadius: theme.radius['3xl'] },
  badgeText: { color: colors.white, fontSize: 12, fontWeight: '600' },
  title: { fontSize: 22, fontWeight: 'bold', color: colors.text.heading, marginBottom: theme.spacing[2] },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: theme.spacing[2.5],
    rowGap: theme.spacing[1],
    marginBottom: theme.spacing[3],
  },
  price: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: 'bold',
    color: colors.primary[600]!,
    includeFontPadding: false,
  },
  priceOld: {
    fontSize: 18,
    lineHeight: 24,
    color: colors.gray[400],
    textDecorationLine: 'line-through',
    includeFontPadding: false,
  },
  discountBadge: { backgroundColor: colors.danger[600]!, borderRadius: theme.radius.lg, paddingHorizontal: theme.spacing[2], paddingVertical: 3 },
  discountBadgeText: { color: colors.white, fontSize: 13, fontWeight: '800' },
  headerRatingRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[1], marginTop: theme.spacing[1.5] },
  headerRatingValue: { fontSize: 15, fontWeight: '700', color: colors.text.heading },
  headerRatingCount: { fontSize: 13, color: colors.text.muted },
  quickInfo: { flexDirection: 'row', gap: theme.spacing[4] },
  quickInfoItem: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[1] },
  quickInfoText: { fontSize: 13, color: colors.text.muted },
  reservedInfoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing[2],
    backgroundColor: colors.warning[50]!,
    borderRadius: theme.radius.xl,
    padding: theme.spacing[2.5],
    marginTop: theme.spacing[3],
  },
  reservedInfoText: { flex: 1, fontSize: 13, lineHeight: 18, color: colors.warning[700]! },
  divider: { marginVertical: theme.spacing[4] },
  actionGrid: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing[2] },
  actionItem: { flex: 1, alignItems: 'center', gap: theme.spacing[1.5] },
  actionIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary[50]!,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { fontSize: 12, lineHeight: 16, color: colors.text.muted, fontWeight: '600', textAlign: 'center' },
  section: { marginBottom: theme.spacing[2] },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: colors.text.heading, marginBottom: theme.spacing[3] },
  specGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  specItem: { width: '50%', marginBottom: theme.spacing[3] },
  specLabel: { fontSize: 13, color: colors.text.muted, marginBottom: theme.spacing[0.5] },
  specValue: { fontSize: 15, fontWeight: '500', color: colors.text.heading },
  description: { fontSize: 15, lineHeight: 22, color: colors.text.heading },
  readMore: { color: colors.primary[600]!, marginTop: theme.spacing[2], fontWeight: '500' },
});

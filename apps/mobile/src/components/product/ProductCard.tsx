import React, { useState, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import { AppImage } from '@/components/AppImage';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { theme, Text } from '@tarodan/ui-native';
import { formatPrice } from '../../utils/format';
import { transformImageUrl } from '../../utils/imageUrl';
import {
  ProductPriceFields,
  getProductEffectivePrice,
  getProductOriginalPriceForDisplay,
  isProductOnSaleDisplay,
  getProductDiscountPercent,
  isProductOutOfStock,
} from '../../utils/productPrice';

const { colors } = theme;

export interface ProductCardProduct extends ProductPriceFields {
  id: string;
  title: string;
  images?: Array<{ id?: string; url?: string; cardUrl?: string }> | string[] | null;
  imageUrl?: string | null;
  viewCount?: number;
  likeCount?: number;
  isPreorder?: boolean;
  isLimited?: boolean;
  isTradeEnabled?: boolean;
  isBoosted?: boolean;
  boostedUntil?: string | null;
  condition?: string;
  /** Ürün statüsü (active = stokta). active dışındaki her statü "stokta yok" sayılır. */
  status?: string | null;
  /** Müsait adet (quantity - reserved). null = sınırsız stok. <= 0 ise stokta yok. */
  availableQuantity?: number | null;
  rating?: { average: number | null; count: number } | null;
  seller?: { id?: string; displayName?: string; isVerified?: boolean } | null;
  brand?: string | null;
  scale?: string | null;
}

export type ProductCardLayout = 'grid' | 'list';

interface ProductCardProps {
  product: ProductCardProduct;
  layout?: ProductCardLayout;
  tag?: string | null;
  onPress?: () => void;
  /** Favori butonu göster (kart üstünde kalp ikonu). */
  onToggleFavorite?: () => void;
  isFavorite?: boolean;
  /** Ürün sepetteyse görsel üstünde "Sepette" göstergesi çıkar. */
  inCart?: boolean;
  /** Grid modu için sütun sayısı bilgisi (aspectRatio ayarı için gerekmez, sadece bilgi). */
  compact?: boolean;
}

const FALLBACK_IMG = 'https://placehold.co/400x400/FFF7ED/f97316?text=Tarodan';

function resolveImageSrc(product: ProductCardProduct): string {
  // Liste hücresi → 'card' varyantı (thumbnail), tam-res değil (#73).
  if (product.imageUrl) return transformImageUrl(product.imageUrl, 'card');
  if (Array.isArray(product.images) && product.images.length > 0) {
    const first = product.images[0] as any;
    if (typeof first === 'string') return transformImageUrl(first, 'card');
    return transformImageUrl(first?.cardUrl || first?.url || null, 'card');
  }
  return FALLBACK_IMG;
}

export function ProductCard({
  product,
  layout = 'grid',
  tag,
  onPress,
  onToggleFavorite,
  isFavorite = false,
  inCart = false,
  compact = false,
}: ProductCardProps) {
  const [imgSrc, setImgSrc] = useState<string>(() => resolveImageSrc(product));

  const effectivePrice = useMemo(() => getProductEffectivePrice(product), [product]);
  const onSale = useMemo(() => isProductOnSaleDisplay(product), [product]);
  const originalPrice = useMemo(() => getProductOriginalPriceForDisplay(product), [product]);
  const discountPct = useMemo(() => getProductDiscountPercent(product), [product]);

  const handlePress = () => {
    if (onPress) return onPress();
    router.push(`/product/${product.id}`);
  };

  const ratingAvg = product.rating?.average ?? null;
  const ratingCount = product.rating?.count ?? 0;

  // Stokta yok: active dışı statü veya müsait adet 0 (null = sınırsız stok → stokta).
  const isOutOfStock = isProductOutOfStock(product);

  if (layout === 'list') {
    return (
      <TouchableOpacity style={styles.listCard} onPress={handlePress} activeOpacity={0.85}>
        <View style={styles.listImageWrap}>
          <AppImage
            source={imgSrc}
            style={[styles.listImage, isOutOfStock && styles.imageDimmed]}
            onError={() => setImgSrc(FALLBACK_IMG)}
          />
          {isOutOfStock ? (
            <View style={styles.outOfStockOverlay}>
              <Text style={styles.outOfStockText}>STOKTA YOK</Text>
            </View>
          ) : null}
          {onSale && discountPct > 0 ? (
            <View style={[styles.badge, styles.saleBadge]}>
              <Text style={styles.badgeText}>%{discountPct}</Text>
            </View>
          ) : null}
          {inCart ? (
            <View style={styles.inCartPill}>
              <Ionicons name="checkmark-circle" size={12} color={colors.white} />
              <Text style={styles.inCartPillText}>Sepette</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.listBody}>
          <Text style={styles.title} numberOfLines={2}>{product.title}</Text>
          {product.brand || product.scale ? (
            <Text style={styles.meta} numberOfLines={1}>
              {[product.brand, product.scale].filter(Boolean).join(' • ')}
            </Text>
          ) : null}
          {product.seller?.displayName ? (
            <Text style={styles.meta} numberOfLines={1}>Satıcı: {product.seller.displayName}</Text>
          ) : null}
          <View style={styles.listFooter}>
            <View>
              {onSale && originalPrice > effectivePrice ? (
                <Text style={styles.priceOld}>{formatPrice(originalPrice)}</Text>
              ) : null}
              <Text style={styles.price}>{formatPrice(effectivePrice)}</Text>
            </View>
            {ratingAvg !== null && ratingCount > 0 ? (
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={14} color={colors.warning[500]!} />
                <Text style={styles.ratingText}>{ratingAvg.toFixed(1)}</Text>
                <Text style={styles.ratingCount}>({ratingCount})</Text>
              </View>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <Pressable style={({ pressed }) => [styles.gridCard, pressed && { opacity: 0.85 }]} onPress={handlePress}>
      <View style={styles.gridImageWrap}>
        <AppImage
          source={imgSrc}
          style={[styles.gridImage, isOutOfStock && styles.imageDimmed]}
          onError={() => setImgSrc(FALLBACK_IMG)}
        />

        {isOutOfStock ? (
          <View style={styles.outOfStockOverlay}>
            <Text style={styles.outOfStockText}>STOKTA YOK</Text>
          </View>
        ) : null}

        {/* Sol üst: sponsorlu / indirim / ön sipariş / limited */}
        <View style={styles.topLeftStack}>
          {product.isBoosted || product.boostedUntil ? (
            <View style={[styles.badge, styles.boostBadge]}>
              <Ionicons name="rocket" size={10} color={colors.white} />
              <Text style={[styles.badgeText, { marginLeft: 4 }]}>SPONSORLU</Text>
            </View>
          ) : null}
          {onSale && discountPct > 0 ? (
            <View style={[styles.badge, styles.saleBadge]}>
              <Text style={styles.badgeText}>%{discountPct} İndirim</Text>
            </View>
          ) : null}
          {product.isPreorder ? (
            <View style={[styles.badge, styles.preorderBadge]}>
              <Text style={styles.badgeText}>ÖN SİPARİŞ</Text>
            </View>
          ) : null}
          {product.isLimited ? (
            <View style={[styles.badge, styles.limitedBadge]}>
              <Ionicons name="star" size={10} color={colors.white} />
              <Text style={[styles.badgeText, { marginLeft: 4 }]}>LIMITED</Text>
            </View>
          ) : null}
          {product.isTradeEnabled ? (
            <View style={[styles.badge, styles.tradeBadge]}>
              <Ionicons name="swap-horizontal" size={10} color={colors.white} />
              <Text style={[styles.badgeText, { marginLeft: 4 }]}>TAKAS</Text>
            </View>
          ) : null}
        </View>

        {/* Sağ üst: tag veya favori */}
        <View style={styles.topRightStack}>
          {tag ? (
            <View style={[styles.badge, styles.neutralBadge]}>
              <Text style={styles.badgeText}>{tag}</Text>
            </View>
          ) : null}
          {onToggleFavorite ? (
            <TouchableOpacity
              style={styles.favBtn}
              onPress={onToggleFavorite}
              accessibilityRole="button"
              accessibilityLabel={isFavorite ? 'Favorilerden çıkar' : 'Favorilere ekle'}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons
                name={isFavorite ? 'heart' : 'heart-outline'}
                size={18}
                color={isFavorite ? colors.danger[600]! : colors.text.heading}
              />
            </TouchableOpacity>
          ) : null}
        </View>

        {inCart ? (
          <View style={styles.inCartPill}>
            <Ionicons name="checkmark-circle" size={12} color={colors.white} />
            <Text style={styles.inCartPillText}>Sepette</Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.gridBody, compact && { padding: 8 }]}>
        <Text style={[styles.title, compact && { fontSize: 13 }]} numberOfLines={2}>
          {product.title}
        </Text>
        {onSale && originalPrice > effectivePrice ? (
          <Text style={styles.priceOld}>{formatPrice(originalPrice)}</Text>
        ) : null}
        <Text style={styles.price}>{formatPrice(effectivePrice)}</Text>
        {ratingAvg !== null && ratingCount > 0 ? (
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={12} color={colors.warning[500]!} />
            <Text style={styles.ratingText}>{ratingAvg.toFixed(1)}</Text>
            <Text style={styles.ratingCount}>({ratingCount})</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // ========== GRID ==========
  gridCard: {
    flex: 1,
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.DEFAULT,
  },
  gridImageWrap: {
    aspectRatio: 1,
    backgroundColor: colors.surface.alt,
    position: 'relative',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  gridBody: {
    padding: 10,
  },

  // ========== LIST ==========
  listCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.DEFAULT,
    padding: 10,
    gap: 12,
  },
  listImageWrap: {
    width: 110,
    height: 110,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.surface.alt,
  },
  listImage: {
    width: '100%',
    height: '100%',
  },
  listBody: {
    flex: 1,
    justifyContent: 'space-between',
  },
  listFooter: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 8,
  },

  // ========== TEXT ==========
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.heading,
    lineHeight: 18,
  },
  meta: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
  },
  price: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.primary[700]!,
    marginTop: 4,
  },
  priceOld: {
    fontSize: 12,
    color: colors.gray[400],
    textDecorationLine: 'line-through',
    marginTop: 4,
  },

  // ========== OUT OF STOCK ==========
  imageDimmed: {
    opacity: 0.45,
  },
  outOfStockOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outOfStockText: {
    backgroundColor: colors.overlay.black70,
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    overflow: 'hidden',
  },

  // ========== BADGES ==========
  topLeftStack: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'column',
    gap: 4,
    alignItems: 'flex-start',
  },
  topRightStack: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'column',
    gap: 4,
    alignItems: 'flex-end',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  badgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  saleBadge: {
    backgroundColor: colors.danger[500]!,
  },
  preorderBadge: {
    backgroundColor: colors.warning[500]!,
  },
  limitedBadge: {
    backgroundColor: colors.warning[500]!,
  },
  tradeBadge: {
    backgroundColor: colors.success[500]!,
  },
  boostBadge: {
    backgroundColor: colors.warning[500]!,
  },
  neutralBadge: {
    backgroundColor: colors.overlay.black70,
  },
  favBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.overlay.white90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inCartPill: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary[600]!,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  inCartPillText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '700',
  },

  // ========== RATING ==========
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 4,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.heading,
    marginLeft: 2,
  },
  ratingCount: {
    fontSize: 11,
    color: colors.text.muted,
    marginLeft: 2,
  },
});

export default ProductCard;

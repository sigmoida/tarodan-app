import React, { useState, useMemo } from 'react';
import { View, StyleSheet, Image, TouchableOpacity, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { TarodanColors } from '../../theme';
import { formatPrice } from '../../utils/format';
import { transformImageUrl } from '../../utils/imageUrl';
import { Text } from '../common/PaperCompat';
import {
  ProductPriceFields,
  getProductEffectivePrice,
  getProductOriginalPriceForDisplay,
  isProductOnSaleDisplay,
  getProductDiscountPercent,
} from '../../utils/productPrice';

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
  condition?: string;
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
  /** Grid modu için sütun sayısı bilgisi (aspectRatio ayarı için gerekmez, sadece bilgi). */
  compact?: boolean;
}

const FALLBACK_IMG = 'https://placehold.co/400x400/FFF7ED/f97316?text=Tarodan';

function resolveImageSrc(product: ProductCardProduct): string {
  if (product.imageUrl) return transformImageUrl(product.imageUrl);
  if (Array.isArray(product.images) && product.images.length > 0) {
    const first = product.images[0] as any;
    if (typeof first === 'string') return transformImageUrl(first);
    return transformImageUrl(first?.cardUrl || first?.url || null);
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

  if (layout === 'list') {
    return (
      <TouchableOpacity style={styles.listCard} onPress={handlePress} activeOpacity={0.85}>
        <View style={styles.listImageWrap}>
          <Image
            source={{ uri: imgSrc }}
            style={styles.listImage}
            onError={() => setImgSrc(FALLBACK_IMG)}
          />
          {onSale && discountPct > 0 ? (
            <View style={[styles.badge, styles.saleBadge]}>
              <Text style={styles.badgeText}>%{discountPct}</Text>
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
                <Ionicons name="star" size={14} color={TarodanColors.star} />
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
        <Image
          source={{ uri: imgSrc }}
          style={styles.gridImage}
          onError={() => setImgSrc(FALLBACK_IMG)}
        />

        {/* Sol üst: indirim / ön sipariş / limited */}
        <View style={styles.topLeftStack}>
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
              <Ionicons name="star" size={10} color="#fff" />
              <Text style={[styles.badgeText, { marginLeft: 4 }]}>LIMITED</Text>
            </View>
          ) : null}
          {product.isTradeEnabled ? (
            <View style={[styles.badge, styles.tradeBadge]}>
              <Ionicons name="swap-horizontal" size={10} color="#fff" />
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
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons
                name={isFavorite ? 'heart' : 'heart-outline'}
                size={18}
                color={isFavorite ? TarodanColors.error : TarodanColors.textPrimary}
              />
            </TouchableOpacity>
          ) : null}
        </View>
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
            <Ionicons name="star" size={12} color={TarodanColors.star} />
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
    backgroundColor: TarodanColors.background,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: TarodanColors.border,
  },
  gridImageWrap: {
    aspectRatio: 1,
    backgroundColor: TarodanColors.surfaceVariant,
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
    backgroundColor: TarodanColors.background,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: TarodanColors.border,
    padding: 10,
    gap: 12,
  },
  listImageWrap: {
    width: 110,
    height: 110,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: TarodanColors.surfaceVariant,
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
    color: TarodanColors.textPrimary,
    lineHeight: 18,
  },
  meta: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    marginTop: 2,
  },
  price: {
    fontSize: 16,
    fontWeight: '800',
    color: TarodanColors.price,
    marginTop: 4,
  },
  priceOld: {
    fontSize: 12,
    color: TarodanColors.priceOld,
    textDecorationLine: 'line-through',
    marginTop: 4,
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
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  saleBadge: {
    backgroundColor: TarodanColors.badgeDiscount,
  },
  preorderBadge: {
    backgroundColor: TarodanColors.accent,
  },
  limitedBadge: {
    backgroundColor: TarodanColors.badgePremium,
  },
  tradeBadge: {
    backgroundColor: TarodanColors.badgeTrade,
  },
  neutralBadge: {
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  favBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
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
    color: TarodanColors.textPrimary,
    marginLeft: 2,
  },
  ratingCount: {
    fontSize: 11,
    color: TarodanColors.textSecondary,
    marginLeft: 2,
  },
});

export default ProductCard;

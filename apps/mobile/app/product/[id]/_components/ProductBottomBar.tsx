import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Button, Text, theme } from '@tarodan/ui-native';
import { isProductTradeOpen } from '@/utils/isProductTradeOpen';
import { ActionTile } from './ActionTile';
import type { PriceInfo } from '../_lib/display';
import type { Product } from '../_lib/types';

const { colors } = theme;

/** Alt aksiyon barı: sahip (düzenle) / stok-yok (pasif) / alıcı (4 eşit sütun). */
export function ProductBottomBar({
  product,
  isOwner,
  isOutOfStock,
  price,
  inCart,
  onEdit,
  onTrade,
  onBuyNow,
  onAddToCart,
  onGoToCart,
}: {
  product: Product;
  isOwner: boolean;
  isOutOfStock: boolean;
  price: PriceInfo;
  inCart: boolean;
  onEdit: () => void;
  onTrade: () => void;
  onBuyNow: () => void;
  onAddToCart: () => void;
  onGoToCart: () => void;
}) {
  const effective = `₺${price.effectivePrice.toLocaleString('tr-TR')}`;
  const original = `₺${price.originalPrice.toLocaleString('tr-TR')}`;

  return (
    <View style={styles.bottomBar}>
      {isOwner ? (
        <View style={styles.bottomRow}>
          <View style={styles.bottomPrice}>
            <Text style={styles.bottomPriceLabel}>Fiyat</Text>
            {price.onSale ? <Text style={styles.bottomPriceOld} numberOfLines={1}>{original}</Text> : null}
            <Text style={styles.bottomPriceValue} numberOfLines={1}>{effective}</Text>
          </View>
          <Button
            testID="product-detail-edit-button"
            variant="primary"
            onPress={onEdit}
            icon="create-outline"
            style={styles.flexButton}
          >
            İlanı Düzenle
          </Button>
        </View>
      ) : isOutOfStock ? (
        <View style={styles.bottomRow}>
          <View style={styles.bottomPrice}>
            <Text style={styles.bottomPriceLabel}>Fiyat</Text>
            <Text style={styles.bottomPriceValue} numberOfLines={1}>{effective}</Text>
          </View>
          <Button
            testID="product-detail-out-of-stock-button"
            variant="secondary"
            onPress={() => {}}
            disabled
            icon="close-circle-outline"
            style={styles.flexButton}
          >
            Stokta Yok
          </Button>
        </View>
      ) : (
        <View style={styles.tileRow}>
          <View style={styles.priceCell}>
            <Text style={styles.bottomPriceLabel}>Fiyat</Text>
            {price.onSale ? <Text style={styles.bottomPriceOld} numberOfLines={1}>{original}</Text> : null}
            <Text style={styles.priceCellValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {effective}
            </Text>
          </View>

          {isProductTradeOpen(product) ? (
            <ActionTile testID="product-detail-trade-button" icon="swap-horizontal" label="Takas" onPress={onTrade} />
          ) : (
            <View style={styles.tilePlaceholder} />
          )}

          <ActionTile
            testID="product-detail-buy-now-button"
            icon="flash"
            label="Hızlı Al"
            variant="primary"
            onPress={onBuyNow}
          />

          {inCart ? (
            <ActionTile testID="product-detail-go-to-cart-button" icon="checkmark-circle" label="Sepette" onPress={onGoToCart} />
          ) : (
            <ActionTile testID="product-detail-add-to-cart-button" icon="cart" label="Sepete Ekle" onPress={onAddToCart} />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bottomBar: {
    flexDirection: 'column',
    gap: 10,
    padding: 16,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border.DEFAULT,
  },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bottomPrice: { flexShrink: 0 },
  bottomPriceLabel: { fontSize: 12, color: colors.text.muted },
  bottomPriceOld: {
    fontSize: 13,
    color: colors.gray[400],
    textDecorationLine: 'line-through',
    includeFontPadding: false,
  },
  bottomPriceValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.heading,
    flexShrink: 0,
    includeFontPadding: false,
    paddingRight: 2,
  },
  flexButton: { flex: 1, borderRadius: 12 },
  tileRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  priceCell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  priceCellValue: { fontSize: 16, fontWeight: 'bold', color: colors.text.heading, includeFontPadding: false },
  tilePlaceholder: { flex: 1 },
});

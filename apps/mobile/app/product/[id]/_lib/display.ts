// Ürün detay görüntüleme yardımcıları — durum rengi, görsel çözümleme, stok.
import { theme } from '@tarodan/ui-native';
import { transformImageUrl } from '@/utils/imageUrl';
import { formatCondition } from '@/utils/format';
import {
  getProductEffectivePrice,
  getProductOriginalPriceForDisplay,
  getProductDiscountPercent,
  isProductOnSaleDisplay,
} from '@/utils/productPrice';
import type { Product } from './types';

export interface PriceInfo {
  effectivePrice: number;
  onSale: boolean;
  originalPrice: number;
  discountPct: number;
}

const { colors } = theme;

const PLACEHOLDER = 'https://placehold.co/400x400/f3f4f6/9ca3af?text=Ürün';

// Durum rozeti renk paleti. Etiket metni TEK KAYNAK formatCondition()'dan gelir
// (backend enum: new | like_new | very_good | good | fair) — burada yalnız renk var.
const CONDITION_COLORS: Record<string, string> = {
  new: colors.success[600]!,
  like_new: colors.info[400]!,
  very_good: colors.info[500]!,
  good: colors.info[600]!,
  fair: colors.warning[500]!,
};

export function getConditionInfo(condition: string) {
  return {
    name: formatCondition(condition),
    color: CONDITION_COLORS[condition] ?? colors.gray[500]!,
  };
}

/** İndirim/fiyat gösterimi — ProductCard ile aynı kural. (DTO gevşek olduğundan
 * paylaşılan util'lere `any` ile geçilir; sıkılaştırma Faz 4.) */
export function getProductPriceInfo(product: Product): PriceInfo {
  const p = product as any;
  return {
    effectivePrice: getProductEffectivePrice(p),
    onSale: isProductOnSaleDisplay(p),
    originalPrice: getProductOriginalPriceForDisplay(p),
    discountPct: getProductDiscountPercent(p),
  };
}

/** Görsel URL'lerini çöz (cardUrl/detailUrl/url) — yoksa placeholder. */
export function resolveProductImages(product: Product): any[] {
  return product?.images && product.images.length > 0
    ? product.images.map((img: any) => {
        const uri = transformImageUrl(img);
        return typeof img === 'string' ? uri : { ...img, url: uri };
      })
    : [PLACEHOLDER];
}

/** Stokta yok: active dışı statü veya müsait adet 0 (null = sınırsız stok → stokta). */
export function isProductOutOfStock(product: Product): boolean {
  return (
    (product.status != null && product.status !== 'active') ||
    (product.availableQuantity != null && product.availableQuantity <= 0)
  );
}

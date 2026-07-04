'use client';

import Link from 'next/link';
import { StarIcon, EyeIcon, HeartIcon, ArrowsRightLeftIcon } from '@heroicons/react/24/outline';
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid';
import { ProductBadge } from '@tarodan/ui';
import OptimizedImage from '@/components/OptimizedImage';
import OutOfStockOverlay from '@/components/ui/OutOfStockOverlay';
import { useTranslation } from '@/i18n';
import { formatCondition } from '@/lib/format';
import {
  getProductEffectivePrice,
  isProductOnSaleDisplay,
  getProductOriginalPriceForDisplay,
  isProductOutOfStock,
} from '@/lib/productPrice';
import type { Product, ProductImage } from '@/types/product';

/**
 * The single product/listing card for the whole marketplace (grid + list).
 * Self-deriving: give it a raw `product` and it computes price / sale / stock /
 * image itself via the shared helpers — callers never precompute. Replaces the
 * hand-rolled inline cards that were duplicated across listings, category,
 * favorites, seller, collections, and the home rails.
 *
 * For pages with a reduced product shape (wishlist / collection items that lack
 * rating/views/brand) or interactive controls, use `hideStats` to drop the
 * meta rows and the `overlay` / `footer` slots for actions (remove, add-to-cart,
 * SOLD badges). Both slots render OUTSIDE the card's `<Link>`, so their own
 * buttons handle clicks without navigating.
 */

const CARD_PLACEHOLDERS = [
  'https://placehold.co/400x400/fff3e0/e65100?text=Hot+Wheels',
  'https://placehold.co/400x400/e3f2fd/1565c0?text=Diecast+Model',
  'https://placehold.co/400x400/fce4ec/c62828?text=Koleksiyon',
  'https://placehold.co/400x400/e8f5e9/2e7d32?text=Model+Araba',
  'https://placehold.co/400x400/f3e5f5/6a1b9a?text=Premium',
  'https://placehold.co/400x400/fff8e1/f57f17?text=Rare+Model',
];

function cardImageUrl(image: ProductImage | string | undefined, index: number, title: string): string {
  const placeholder = CARD_PLACEHOLDERS[index % CARD_PLACEHOLDERS.length];
  const url =
    typeof image === 'string' ? image : image?.cardUrl ?? image?.detailUrl ?? image?.url;
  if (url && !url.includes('picsum.photos')) return url;
  if (url && url.includes('picsum.photos') && title) {
    return `https://placehold.co/800x600/1a1a2e/eee?text=${encodeURIComponent(title.substring(0, 25).trim())}`;
  }
  return placeholder;
}

const fmtTL = (n: number) =>
  n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' ₺';

export interface ProductCardProps {
  product: Product;
  layout?: 'grid' | 'list';
  /** Position in its list — drives placeholder rotation and eager loading. */
  index?: number;
  priority?: boolean;
  /** Drop the brand subline + rating/views/likes rows (reduced-data contexts). */
  hideStats?: boolean;
  /** Click-isolated slot pinned to the top-right of the card (badges, remove). */
  overlay?: React.ReactNode;
  /** Click-isolated slot below the card (e.g. an add-to-cart button). */
  footer?: React.ReactNode;
}

export default function ProductCard({
  product,
  layout = 'grid',
  index = 0,
  priority,
  hideStats = false,
  overlay,
  footer,
}: ProductCardProps) {
  const { t, locale } = useTranslation();

  const outOfStock = isProductOutOfStock(product);
  const onSale = isProductOnSaleDisplay(product);
  const effectivePrice = getProductEffectivePrice(product);
  const originalPrice = getProductOriginalPriceForDisplay(product);
  const isTrade = Boolean(product.trade_available || product.isTradeEnabled);
  const brandName = typeof product.brand === 'object' ? product.brand?.name : product.brand;
  const firstImage = Array.isArray(product.images) ? product.images[0] : undefined;
  const imageUrl = cardImageUrl(firstImage, index, product.title);
  const hasRating = product.rating && product.rating.average !== null && product.rating.count > 0;

  const subline = (
    <>
      {brandName}
      {product.scale ? ` · ${product.scale}` : ''}
      {product.year ? ` · ${product.year}` : ''}
    </>
  );

  const ratingBlock = (starClass: string, textClass: string) =>
    hasRating ? (
      <span className="flex items-center gap-0.5">
        <StarIconSolid className={`${starClass} text-warning-400`} />
        <span className="font-semibold text-heading">{product.rating!.average!.toFixed(1)}</span>
        <span>({product.rating!.count})</span>
      </span>
    ) : (
      <span className="flex items-center gap-0.5">
        <StarIcon className={`${starClass} ${textClass}`} />
        <span>{t('product.noReviewsShort')}</span>
      </span>
    );

  if (layout === 'list') {
    return (
      <div className="relative">
        <Link href={`/listings/${product.id}`}>
          <div className="bg-surface-elevated rounded border border-border hover:border-primary-300 hover:shadow-sm transition-all flex gap-4 p-3">
            <div className="relative w-20 h-20 flex-shrink-0 bg-surface-alt rounded overflow-hidden">
              <OptimizedImage
                src={imageUrl}
                alt={product.title}
                fill
                className={`object-cover${outOfStock ? ' opacity-50' : ''}`}
                fallbackSrc={CARD_PLACEHOLDERS[index % CARD_PLACEHOLDERS.length]}
                logContext={{ listingId: product.id, page: 'product-card' }}
                priority={priority}
              />
              {outOfStock && <OutOfStockOverlay />}
              {isTrade && (
                <div className="absolute top-1 right-1 bg-success-500 text-inverted p-0.5 rounded">
                  <ArrowsRightLeftIcon className="w-2.5 h-2.5" />
                </div>
              )}
            </div>
            <div className="flex-1 flex items-center justify-between min-w-0">
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-heading line-clamp-1 text-sm">{product.title}</h3>
                {!hideStats && <p className="text-xs text-muted mt-0.5">{subline}</p>}
                <span className="text-[10px] text-subtle bg-surface-alt px-1.5 py-0.5 rounded inline-block mt-1">
                  {formatCondition(product.condition, locale)}
                </span>
              </div>
              <div className="flex items-center gap-3 ml-4">
                {!hideStats && (
                  <div className="flex items-center gap-2.5 text-[11px] text-subtle">
                    {ratingBlock('w-3.5 h-3.5', 'text-subtle')}
                    <span className="flex items-center gap-0.5">
                      <EyeIcon className="w-3.5 h-3.5" />
                      {product.viewCount ?? 0}
                    </span>
                    <span className="flex items-center gap-0.5">
                      <HeartIcon className="w-3.5 h-3.5" />
                      {product.likeCount ?? 0}
                    </span>
                  </div>
                )}
                {onSale && (
                  <span className="text-xs text-danger-500 font-semibold bg-danger-50 px-1.5 py-0.5 rounded">
                    %{product.discountPercent ?? 0}
                  </span>
                )}
                <p className="text-base font-bold text-primary-600 whitespace-nowrap">{fmtTL(effectivePrice)}</p>
              </div>
            </div>
          </div>
        </Link>
        {overlay && <div className="absolute top-2 right-2 z-10">{overlay}</div>}
        {footer && <div className="mt-2">{footer}</div>}
      </div>
    );
  }

  return (
    <div className="relative group h-full flex flex-col">
      <Link href={`/listings/${product.id}`} className="flex-1">
        <div className="bg-surface-elevated rounded border border-border overflow-hidden hover:border-primary-300 hover:shadow-md transition-all h-full flex flex-col">
          <div className="relative aspect-square bg-surface-alt">
            <OptimizedImage
              src={imageUrl}
              alt={product.title}
              fill
              className={`object-cover group-hover:scale-[1.03] transition-transform duration-300${outOfStock ? ' opacity-50' : ''}`}
              fallbackSrc={CARD_PLACEHOLDERS[index % CARD_PLACEHOLDERS.length]}
              logContext={{ listingId: product.id, page: 'product-card' }}
              priority={priority}
            />
            {outOfStock && <OutOfStockOverlay />}
            <div className="absolute top-1.5 left-1.5 flex flex-col items-start gap-1">
              {product.isBoosted && (
                <ProductBadge variant="sponsored" className="text-[10px] px-1.5 py-0.5">
                  {locale === 'en' ? 'Sponsored' : 'Sponsorlu'}
                </ProductBadge>
              )}
              {isTrade && (
                <div className="bg-success-500 text-inverted text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5">
                  <ArrowsRightLeftIcon className="w-2.5 h-2.5" />
                  <span className="hidden sm:inline">{locale === 'en' ? 'Trade' : 'Takas'}</span>
                </div>
              )}
            </div>
            {onSale && (
              <div className="absolute top-1.5 right-1.5">
                <ProductBadge variant="sale" className="text-[10px] px-1.5 py-0.5">
                  %{product.discountPercent ?? 0}
                </ProductBadge>
              </div>
            )}
          </div>
          <div className="p-2.5 flex-1 flex flex-col">
            <h3 className="font-medium text-heading line-clamp-2 text-xs leading-tight mb-1 group-hover:text-primary-600 transition-colors">
              {product.title}
            </h3>
            {!hideStats && <p className="text-[10px] text-subtle mb-1.5">{subline}</p>}
            {!hideStats && (
              <div className="flex items-center gap-2 mb-1.5 text-[10px] text-subtle">
                {ratingBlock('w-3 h-3', '')}
                <span className="flex items-center gap-0.5">
                  <EyeIcon className="w-3 h-3" />
                  {product.viewCount ?? 0}
                </span>
                <span className="flex items-center gap-0.5">
                  <HeartIcon className="w-3 h-3" />
                  {product.likeCount ?? 0}
                </span>
              </div>
            )}
            <div className="mt-auto pt-1.5 border-t border-border-subtle">
              <span className="text-[9px] text-subtle bg-surface px-1 py-0.5 rounded inline-block mb-1">
                {formatCondition(product.condition, locale)}
              </span>
              {onSale && (
                <span className="text-[10px] text-subtle line-through ml-1.5">{fmtTL(originalPrice)}</span>
              )}
              <p className="text-sm font-bold text-primary-600">{fmtTL(effectivePrice)}</p>
            </div>
          </div>
        </div>
      </Link>
      {overlay && <div className="absolute top-1.5 right-1.5 z-10">{overlay}</div>}
      {footer && <div className="mt-2">{footer}</div>}
    </div>
  );
}

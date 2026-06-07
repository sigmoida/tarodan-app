'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { HandThumbUpIcon, StarIcon } from '@heroicons/react/24/solid';
import { ProductBadge as Badge } from '@tarodan/ui';

const CARD_PLACEHOLDERS = [
  'https://placehold.co/400x400/fff3e0/e65100?text=Hot+Wheels',
  'https://placehold.co/400x400/e3f2fd/1565c0?text=Diecast+Model',
  'https://placehold.co/400x400/fce4ec/c62828?text=Koleksiyon',
  'https://placehold.co/400x400/e8f5e9/2e7d32?text=Model+Araba',
  'https://placehold.co/400x400/f3e5f5/6a1b9a?text=Premium',
  'https://placehold.co/400x400/fff8e1/f57f17?text=Rare+Model',
];

/**
 * Flattened attribute entry as returned by /products/* endpoints (formatProductResponse).
 * `slug` is the Attribute.slug (e.g. 'treasure-hunt'); `groupSlug` is AttributeGroup.slug
 * (e.g. 'hw-rarity'). HW rarity badge derives from these.
 */
interface ProductAttributeEntry {
  slug?: string;
  groupSlug?: string;
}

interface ProductCardProduct {
  id: string;
  title: string;
  price: number;
  images?: Array<{ id?: string; url?: string; cardUrl?: string; detailUrl?: string; sortOrder?: number }> | string[];
  viewCount?: number;
  likeCount?: number;
  isPreorder?: boolean;
  isLimited?: boolean;
  isBoosted?: boolean;
  condition?: string;
  rating?: { average: number | null; count: number };
  /**
   * Flattened attributes from API. Used to derive Hot Wheels rarity badge in-component.
   * Products without HW data simply won't render a rarity badge.
   */
  attributes?: ProductAttributeEntry[];
}

/** Returns the HW rarity tier for a product, or undefined if none. */
function deriveHwRarity(
  attributes: ProductAttributeEntry[] | undefined,
): 'treasure-hunt' | 'super-treasure-hunt' | 'chase' | undefined {
  if (!attributes?.length) return undefined;
  const rarityAttr = attributes.find((a) => a.groupSlug === 'hw-rarity')?.slug;
  if (
    rarityAttr === 'treasure-hunt' ||
    rarityAttr === 'super-treasure-hunt' ||
    rarityAttr === 'chase'
  ) {
    return rarityAttr;
  }
  return undefined;
}

interface ProductCardProps {
  product: ProductCardProduct;
  layout?: 'grid' | 'list';
  tag?: string | null;
  isOnSale?: boolean;
  originalPrice?: number;
  effectivePrice: number;
  discountPercent?: number | null;
  imageUrl: string;
  priority?: boolean;
  locale?: string;
  priceLabel?: string;
}

export default function ProductCard({
  product,
  layout = 'grid',
  tag,
  isOnSale,
  originalPrice,
  effectivePrice,
  discountPercent,
  imageUrl,
  priority = false,
  locale = 'tr',
}: ProductCardProps) {
  const fallbackIdx = product.id ? product.id.charCodeAt(0) % CARD_PLACEHOLDERS.length : 0;
  const [imgSrc, setImgSrc] = useState(imageUrl || CARD_PLACEHOLDERS[fallbackIdx]);
  const handleImgError = () => setImgSrc(CARD_PLACEHOLDERS[fallbackIdx]);
  const hwRarity = deriveHwRarity(product.attributes);

  const formatCurrency = (n: number) =>
    n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' \u20BA';

  if (layout === 'list') {
    return (
      <Link href={`/listings/${product.id}`}>
        <div className="card-premium flex gap-4 p-4">
          <div className="relative w-32 h-32 flex-shrink-0 bg-surface-alt rounded overflow-hidden">
            <Image
              src={imgSrc}
              alt={product.title}
              fill
              className="object-cover"
              unoptimized
              priority={priority}
              loading={priority ? 'eager' : 'lazy'}
              onError={handleImgError}
            />
            {product.isBoosted && (
              <div className="absolute top-2 left-2">
                <Badge variant="sponsored">{locale === 'en' ? 'Sponsored' : 'Sponsorlu'}</Badge>
              </div>
            )}
            {tag && (
              <div className="absolute top-2 right-2">
                <Badge variant={tag === 'Yeni' || tag === 'New' ? 'new' : tag === 'Nadir' || tag === 'Rare' ? 'rare' : 'default'}>
                  {tag}
                </Badge>
              </div>
            )}
          </div>
          <div className="flex-1 flex flex-col justify-between min-w-0">
            <div>
              <h3 className="font-semibold text-heading line-clamp-2 mb-2">{product.title}</h3>
              <div className="flex items-center gap-4 text-sm text-muted mb-2">
                {(product.viewCount ?? 0) > 0 && (
                  <div className="flex items-center gap-1">
                    <svg className="w-4 h-4 text-info-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    <span>{product.viewCount}</span>
                  </div>
                )}
                {(product.likeCount ?? 0) > 0 && (
                  <div className="flex items-center gap-1">
                    <HandThumbUpIcon className="w-4 h-4 text-primary-500" />
                    <span>{product.likeCount}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                {isOnSale && originalPrice && (
                  <p className="text-sm text-subtle line-through">{formatCurrency(originalPrice)}</p>
                )}
                <p className="text-primary-500 font-bold text-lg">{formatCurrency(effectivePrice)}</p>
              </div>
              {product.rating && product.rating.average !== null && product.rating.count > 0 && (
                <div className="flex items-center gap-1">
                  <StarIcon className="w-4 h-4 text-warning-400" />
                  <span className="text-sm font-semibold">{product.rating.average.toFixed(1)}</span>
                  <span className="text-xs text-muted">({product.rating.count})</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link href={`/listings/${product.id}`}>
      <div className="card-premium overflow-hidden">
        <div className="relative aspect-square bg-surface-alt">
          <Image
            src={imgSrc}
            alt={product.title}
            fill
            className="object-cover"
            unoptimized
            priority={priority}
            loading={priority ? 'eager' : 'lazy'}
            onError={handleImgError}
          />
          <div className="absolute top-3 left-3 flex flex-col items-start gap-1.5">
            {product.isBoosted && (
              <Badge variant="sponsored">{locale === 'en' ? 'Sponsored' : 'Sponsorlu'}</Badge>
            )}
            {(product.viewCount ?? 0) > 0 && (
              <div className="flex items-center gap-1 bg-surface-elevated/90 backdrop-blur-sm px-2 py-1 rounded shadow-soft">
                <svg className="w-3.5 h-3.5 text-info-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <span className="text-xs font-semibold text-heading">{product.viewCount}</span>
              </div>
            )}
            {product.isPreorder && (
              <Badge variant="preorder">
                <span className="w-1.5 h-1.5 bg-surface-elevated rounded-sm animate-pulse" />
                {locale === 'en' ? 'PRE-ORDER' : 'ON SIPARIS'}
              </Badge>
            )}
            {product.isLimited && (
              <Badge variant="limited">
                <StarIcon className="w-3 h-3 text-inverted" />
                {locale === 'en' ? 'LIMITED' : 'LIMITED'}
              </Badge>
            )}
            {hwRarity === 'super-treasure-hunt' && (
              // $TH — Super Treasure Hunt, highest-tier HW rarity. Distinct from regular TH.
              <Badge variant="rare">
                <StarIcon className="w-3 h-3 text-inverted" />
                $TH
              </Badge>
            )}
            {hwRarity === 'treasure-hunt' && (
              <Badge variant="rare">
                <StarIcon className="w-3 h-3 text-inverted" />
                TH
              </Badge>
            )}
            {hwRarity === 'chase' && (
              <Badge variant="rare">CHASE</Badge>
            )}
          </div>
          {isOnSale && discountPercent && (
            <div className="absolute top-3 left-3 mt-0">
              <Badge variant="sale">%{discountPercent} {locale === 'en' ? 'OFF' : 'Indirim'}</Badge>
            </div>
          )}
          {tag && (
            <div className="absolute top-3 right-3">
              <Badge variant={tag === 'Yeni' || tag === 'New' ? 'new' : tag === 'Nadir' || tag === 'Rare' ? 'rare' : 'default'}>
                {tag}
              </Badge>
            </div>
          )}
        </div>
        <div className="p-3">
          <h3 className="font-medium text-heading line-clamp-2 text-sm">{product.title}</h3>
          {isOnSale && originalPrice && (
            <p className="text-xs text-subtle line-through mt-0.5">{formatCurrency(originalPrice)}</p>
          )}
          <p className="text-primary-500 font-bold mt-1">{formatCurrency(effectivePrice)}</p>
        </div>
      </div>
    </Link>
  );
}

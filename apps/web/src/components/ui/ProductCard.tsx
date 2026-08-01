/** @format */

"use client";

import { Link } from "@/i18n/navigation";
import { EyeIcon, ArrowsRightLeftIcon } from "@heroicons/react/24/outline";
import {
  StarIcon as StarIconSolid,
  HeartIcon as HeartSolidIcon,
} from "@heroicons/react/24/solid";
import { ProductBadge } from "@tarodan/ui";
import OptimizedImage from "@/components/OptimizedImage";
import OutOfStockOverlay from "@/components/ui/OutOfStockOverlay";
import { useTranslations } from "next-intl";
import {
  getProductEffectivePrice,
  isProductOnSaleDisplay,
  getProductOriginalPriceForDisplay,
  isProductOutOfStock,
} from "@/lib/productPrice";
import type { Product, ProductImage } from "@/types/product";

/**
 * The single product/listing card for the whole marketplace (grid + list). It is
 * **fluid**: it fills whatever grid cell it's dropped into, so the same card works
 * at 4-across or 6-across — the column count is each route's grid, never a card
 * prop. Self-deriving: give it a raw `product` and it computes price / sale /
 * stock / image itself via the shared helpers — callers never precompute.
 *
 * Kept to a minimal API. Title, price and image ALWAYS render. `showMeta` (default
 * true) is the one toggle for the secondary info (brand · scale · year, rating,
 * views/likes, condition) — pass `false` for lean rails, dense grids or
 * reduced-shape items. `overlay` / `footer` are click-isolated slots for actions
 * (remove, add-to-cart, SOLD badges) rendered OUTSIDE the card's `<Link>`.
 */

const CARD_PLACEHOLDERS = [
  "https://placehold.co/400x400/fff3e0/e65100?text=Hot+Wheels",
  "https://placehold.co/400x400/e3f2fd/1565c0?text=Diecast+Model",
  "https://placehold.co/400x400/fce4ec/c62828?text=Koleksiyon",
  "https://placehold.co/400x400/e8f5e9/2e7d32?text=Model+Araba",
  "https://placehold.co/400x400/f3e5f5/6a1b9a?text=Premium",
  "https://placehold.co/400x400/fff8e1/f57f17?text=Rare+Model",
];

function cardImageUrl(
  image: ProductImage | string | undefined,
  index: number,
  title: string,
): string {
  const placeholder = CARD_PLACEHOLDERS[index % CARD_PLACEHOLDERS.length];
  const url =
    typeof image === "string"
      ? image
      : (image?.cardUrl ?? image?.detailUrl ?? image?.url);
  if (url && !url.includes("picsum.photos")) return url;
  if (url && url.includes("picsum.photos") && title) {
    return `https://placehold.co/800x600/1a1a2e/eee?text=${encodeURIComponent(title.substring(0, 25).trim())}`;
  }
  return placeholder;
}

const fmtTL = (n: number) =>
  n.toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }) + " ₺";

export interface ProductCardProps {
  product: Product;
  layout?: "grid" | "list";
  /** Position in its list — drives placeholder rotation and eager loading. */
  index?: number;
  priority?: boolean;
  /**
   * Show the secondary meta — brand · scale · year, rating, views/likes and the
   * condition chip. Default `true`; pass `false` for lean rails / dense grids /
   * reduced-shape items (title, price and image always stay).
   */
  showMeta?: boolean;
  /** Click-isolated slot pinned to the top-right of the card (badges, remove). */
  overlay?: React.ReactNode;
  /** Click-isolated slot pinned to the top-left of the card (e.g. a SOLD badge). */
  overlayStart?: React.ReactNode;
  /** Click-isolated slot below the card (e.g. an add-to-cart button). */
  footer?: React.ReactNode;
  /**
   * Card link target. Defaults to the listing detail page; pass `null` for a
   * non-navigating card (e.g. a collection's custom item that has no listing).
   */
  href?: string | null;
}

/** Wraps the card body in a `Link` — or a plain `div` when `href` is null. */
function CardLink({
  href,
  className,
  onClick,
  children,
}: {
  href: string | null;
  className?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  if (!href) return <div className={className}>{children}</div>;
  return (
    <Link href={href} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}

export default function ProductCard({
  product,
  layout = "grid",
  index = 0,
  priority,
  showMeta = true,
  overlay,
  overlayStart,
  footer,
  href,
}: ProductCardProps) {
  const t = useTranslations();

  const linkHref = href === undefined ? `/listings/${product.id}` : href;
  const trackClick =
    href === undefined
      ? () => {
          void fetch(`/gateway/products/${product.id}/click`, {
            method: "POST",
            keepalive: true,
          }).catch(() => undefined);
        }
      : undefined;

  const outOfStock = isProductOutOfStock(product);
  const onSale = isProductOnSaleDisplay(product);
  const effectivePrice = getProductEffectivePrice(product);
  const originalPrice = getProductOriginalPriceForDisplay(product);
  // `tradeAvailable` API'nin türettiği efektif değerdir (satıcının üyeliği
  // takas hakkını kaybettiyse false). Yoksa eski alanlara düşülür.
  const isTrade = Boolean(
    product.tradeAvailable ??
    (product.trade_available || product.isTradeEnabled),
  );
  const firstImage = Array.isArray(product.images)
    ? product.images[0]
    : undefined;
  const imageUrl = cardImageUrl(firstImage, index, product.title);
  const hasRating =
    product.rating &&
    product.rating.average !== null &&
    product.rating.count > 0;

  // Rating chip — hidden entirely when the product has no reviews yet.
  const ratingBlock = (starClass: string) =>
    hasRating ? (
      <span className="flex items-center gap-0.5">
        <StarIconSolid className={`${starClass} text-warning-400`} />
        <span className="font-semibold text-heading">
          {product.rating!.average!.toFixed(1)}
        </span>
        <span>({product.rating!.count})</span>
      </span>
    ) : null;

  if (layout === "list") {
    return (
      <div className="relative">
        <CardLink href={linkHref} onClick={trackClick}>
          <div className="bg-surface-elevated rounded-lg border border-border hover:border-primary-300 hover:shadow-sm transition-all flex items-center gap-4 p-3">
            <div className="relative w-28 h-28 sm:w-32 sm:h-32 flex-shrink-0 bg-surface-alt rounded-lg overflow-hidden">
              <OptimizedImage
                src={imageUrl}
                alt={product.title}
                fill
                className={`object-cover${outOfStock ? " opacity-50" : ""}`}
                fallbackSrc={
                  CARD_PLACEHOLDERS[index % CARD_PLACEHOLDERS.length]
                }
                logContext={{ listingId: product.id, page: "product-card" }}
                priority={priority}
              />
              {outOfStock && <OutOfStockOverlay />}
              {isTrade && (
                <ProductBadge
                  variant="trade"
                  className="absolute top-1 right-1 p-1"
                  icon={<ArrowsRightLeftIcon className="w-3 h-3" />}
                />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-heading line-clamp-2 text-xl sm:text-2xl leading-tight">
                {product.title}
              </h3>
              {showMeta && (
                <div className="flex items-center gap-4 mt-2 text-sm sm:text-base text-subtle">
                  <span className="flex items-center gap-1">
                    <EyeIcon className="w-4 h-4 text-primary-500" />
                    {product.viewCount ?? 0}
                  </span>
                  <span className="flex items-center gap-1">
                    <HeartSolidIcon className="w-4 h-4 text-danger-500" />
                    {product.likeCount ?? 0}
                  </span>
                  {ratingBlock("w-4 h-4")}
                </div>
              )}
              {showMeta && product.description && (
                <p className="mt-2 line-clamp-2 text-sm text-muted sm:text-base">
                  {product.description}
                </p>
              )}
            </div>
            <div className="ml-4 flex flex-col items-end text-right flex-shrink-0">
              {onSale && (
                <span className="text-sm text-subtle line-through">
                  {fmtTL(originalPrice)}
                </span>
              )}
              <p className="text-xl sm:text-2xl font-bold text-primary-600 whitespace-nowrap">
                {fmtTL(effectivePrice)}
              </p>
              {onSale && (
                <ProductBadge variant="sale" className="mt-1">
                  %{product.discountPercent ?? 0}
                </ProductBadge>
              )}
            </div>
          </div>
        </CardLink>
        {overlay && (
          <div className="absolute top-2 right-2 z-10">{overlay}</div>
        )}
        {footer && <div className="mt-2">{footer}</div>}
      </div>
    );
  }

  return (
    <div className="relative group h-full flex flex-col overflow-hidden rounded border border-border bg-surface-elevated transition-all hover:border-primary-300 hover:shadow-md">
      <CardLink
        href={linkHref}
        className="flex flex-1 flex-col"
        onClick={trackClick}
      >
        <div className="relative aspect-square bg-surface-alt">
          <OptimizedImage
            src={imageUrl}
            alt={product.title}
            fill
            className={`object-cover group-hover:scale-[1.03] transition-transform duration-300${outOfStock ? " opacity-50" : ""}`}
            fallbackSrc={CARD_PLACEHOLDERS[index % CARD_PLACEHOLDERS.length]}
            logContext={{ listingId: product.id, page: "product-card" }}
            priority={priority}
          />
          {outOfStock && <OutOfStockOverlay />}
          <div className="absolute top-1.5 left-1.5 flex flex-col items-start gap-1">
            {product.isBoosted && (
              <ProductBadge
                variant="sponsored"
                className="text-sm px-1.5 py-0.5"
              >
                {t("product.sponsored")}
              </ProductBadge>
            )}
            {isTrade && (
              <ProductBadge
                variant="trade"
                className="text-sm px-1.5 py-0.5"
                icon={<ArrowsRightLeftIcon className="w-2.5 h-2.5" />}
              >
                <span className="hidden sm:inline">{t("faq.trade")}</span>
              </ProductBadge>
            )}
          </div>
          {onSale && (
            <div className="absolute top-1.5 right-1.5">
              <ProductBadge variant="sale" className="text-sm px-1.5 py-0.5">
                %{product.discountPercent ?? 0}
              </ProductBadge>
            </div>
          )}
        </div>
        <div className="p-2.5 flex-1 flex flex-col">
          <h3 className="font-medium text-heading line-clamp-2 text-sm sm:text-md leading-tight mb-1 group-hover:text-primary-600 transition-colors">
            {product.title}
          </h3>
          {/* Meta + price pinned to the bottom so views/likes align across
						    cards regardless of a 1- or 2-line title. */}
          <div className="mt-auto">
            {showMeta && (
              <div className="flex items-center gap-3 mb-1.5 text-xs sm:text-sm text-subtle">
                {ratingBlock("w-4 h-4")}
                <span className="flex items-center gap-0.5">
                  <HeartSolidIcon className="w-4 h-4 text-danger-500" />
                  {product.likeCount ?? 0}
                </span>
                <span className="flex items-center gap-0.5">
                  <EyeIcon className="w-4 h-4 text-primary-500" />
                  {product.viewCount ?? 0}
                </span>
              </div>
            )}
            <div className="pt-1.5 border-t border-border-subtle">
              {onSale && (
                <span className="text-sm text-subtle line-through ml-1.5">
                  {fmtTL(originalPrice)}
                </span>
              )}
              <p className="font-bold text-primary-600 text-md sm:text-lg">
                {fmtTL(effectivePrice)}
              </p>
            </div>
          </div>
        </div>
      </CardLink>
      {footer && <div className="px-2.5 pb-2.5">{footer}</div>}
      {overlay && (
        <div className="absolute top-1.5 right-1.5 z-10">{overlay}</div>
      )}
      {overlayStart && (
        <div className="absolute top-1.5 left-1.5 z-10">{overlayStart}</div>
      )}
    </div>
  );
}

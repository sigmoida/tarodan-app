/** @format */

"use client";

import {
  EyeIcon,
  ArrowsRightLeftIcon,
  RocketLaunchIcon,
} from "@heroicons/react/24/outline";
import {
  StarIcon as StarIconSolid,
  HeartIcon as HeartSolidIcon,
} from "@heroicons/react/24/solid";
import { ProductBadge } from "@tarodan/ui/product-badge";
import OptimizedImage from "@/components/OptimizedImage";
import OutOfStockOverlay from "@/components/ui/OutOfStockOverlay";
import ProductCardBadges from "@/components/ui/ProductCardBadges";
import ProductCardFavorite from "@/components/ui/ProductCardFavorite";
import ProductCardPriceRow from "@/components/ui/ProductCardAction";
import ProductCardTitleLink from "@/components/ui/ProductCardTitleLink";
import {
  describeProductBadges,
  productBadgeLabels,
  selectProductCardBadges,
} from "@/lib/productCardBadges";
import { toProductCardListing } from "@/lib/productCardListing";
import { useTranslations } from "next-intl";
import {
  getProductEffectivePrice,
  isProductOnSaleDisplay,
  getProductDiscountPercent,
  getProductOriginalPriceForDisplay,
  isProductOutOfStock,
} from "@/lib/productPrice";
import type { Product, ProductImage } from "@/types/product";
import { formatTL } from "@/lib/format";
import { IMAGE_SIZES } from "@/lib/imageSizes";
import { PRODUCT_PLACEHOLDER } from "@/lib/productPlaceholder";

/**
 * The single product/listing card for the whole marketplace (grid + list). It is
 * **fluid**: it fills whatever grid cell it's dropped into, so the same card works
 * at 4-across or 6-across — the column count is each route's grid, never a card
 * prop. Its width must come from outside (a grid cell or a sized wrapper): the
 * grid card is a size container (`@container`) and never grows to fit its
 * content. Self-deriving: give it a raw `product` and it computes price / sale /
 * stock / image itself via the shared helpers — callers never precompute.
 *
 * Kept to a minimal API. Title, price and image ALWAYS render. `showMeta` (default
 * true) is the one toggle for the secondary info (brand · scale · year, rating,
 * views/likes, condition) — pass `false` for lean rails, dense grids or
 * reduced-shape items. `overlay` / `footer` are click-isolated slots for actions
 * (remove, add-to-cart, SOLD badges).
 *
 * The title is the card's one link, stretched over the whole card
 * (`ProductCardTitleLink`), so nothing else is inside an `<a>`: the favorite
 * heart at the image's top-right (`ProductCardFavorite`) and the card action
 * in the price row (`ProductCardPriceRow`: cart toggle, or "Öne Çıkar" /
 * "Süre Ekle" on the viewer's own listing, from `productCardAction`) are
 * sibling buttons above it. The heart is skipped for non-navigating cards
 * (`href={null}`), where the caller opts out with `showFavorite={false}`, and
 * on grid cards that fill the top-right slot with their own `overlay`. The
 * action is skipped for non-navigating cards and for cards with a `footer`
 * (Favorites has its own cart button there). The grid image's top-left holds
 * the badge stack (max 2: %discount → boosted → trade → campaign, see
 * `selectProductCardBadges`); it is not drawn when the caller fills the
 * top-left slot with `overlayStart`. The list layout shows the trade icon
 * (top-left of the image) and the boosted badge above the title; the discount
 * stays beside the price.
 */

/**
 * Görselsiz ilan için YEREL placeholder (`_home/lib/helpers.ts` ile aynı dosya).
 * Burada bir zamanlar harici placehold.co URL'lerinden oluşan bir liste vardı ve
 * üzerlerinde "Hot Wheels", "Premium", "Rare Model" yazıyordu: her görselsiz
 * ilan hem üçüncü parti bir servise istek atıyor hem de taşımadığı bir marka
 * iddiasını taşıyordu.
 */

function cardImageUrl(image: ProductImage | string | undefined): string {
  const url =
    typeof image === "string"
      ? image
      : (image?.cardUrl ?? image?.detailUrl ?? image?.url);
  // picsum.photos eski demo verisinin izidir; gerçek görsel her zaman API'nin
  // verdiği mutlak S3/CDN URL'idir.
  if (url && !url.includes("picsum.photos")) return url;
  return PRODUCT_PLACEHOLDER;
}

// Para biçimi TEK yerden gelir (`lib/format`): ekranlar kendi
// `toLocaleString` çağrılarını yazdığında aynı ürün bir kartta "468 ₺",
// detayda "468,19 TL" görünüyor ve kart biçimi kuruşu YUVARLIYORDU.
const fmtTL = formatTL;

export interface ProductCardProps {
  product: Product;
  layout?: "grid" | "list";
  /** Position in its list — drives eager loading of the first cards. */
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
  /**
   * Click-isolated slot below the card (e.g. an add-to-cart button). When set,
   * the card shows no action of its own in the price row.
   */
  footer?: React.ReactNode;
  /**
   * Card link target. Defaults to the listing detail page; pass `null` for a
   * non-navigating card (e.g. a collection's custom item that has no listing).
   */
  href?: string | null;
  /**
   * Show the favorite heart on the image (default `true`). Pass `false` where the
   * card already has its own wishlist control (e.g. Favorites' remove button).
   * Never shown on non-navigating cards (`href={null}`).
   */
  showFavorite?: boolean;
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
  showFavorite = true,
}: ProductCardProps) {
  const t = useTranslations();
  const badgeLabels = productBadgeLabels(t);

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
  // Kalp yalnız gerçek ilan kartında: özel (ilansız) koleksiyon öğesi
  // favorilenemez.
  const favorite = showFavorite && linkHref !== null;
  // The card action needs a real listing, and gives way to a caller's footer.
  const withAction = linkHref !== null && !footer;
  const listing = toProductCardListing(product);

  const outOfStock = isProductOutOfStock(product);
  const onSale = isProductOnSaleDisplay(product);
  const effectivePrice = getProductEffectivePrice(product);
  const originalPrice = getProductOriginalPriceForDisplay(product);
  const salePercent = getProductDiscountPercent(product);
  const firstImage = Array.isArray(product.images)
    ? product.images[0]
    : undefined;
  const imageUrl = cardImageUrl(firstImage);
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
    // The list row shows the discount, boosted and trade badges (the
    // selection is the grid stack's `selectProductCardBadges`).
    const listBadges = selectProductCardBadges(product, Infinity).filter(
      (badge) =>
        badge.kind === "sale" ||
        badge.kind === "boosted" ||
        badge.kind === "trade",
    );
    const isTrade = listBadges.some((badge) => badge.kind === "trade");
    const isBoosted = listBadges.some((badge) => badge.kind === "boosted");
    return (
      <div className="relative">
        {/*
          Dar ekranda satır sarar: `xs` altında fiyat bloğu `w-full` ile kendi
          satırına iner. Üç sütun yan yana kaldığında (112px görsel + sarmayan
          fiyat) başlığa 25px kalıyordu — kart okunamaz hâle geliyordu. Görsel
          ve yazı ölçüleri de aynı gerekçeyle kademeli.

          The title is a stretched link: the whole row is clickable, but the
          row is not inside the `<a>`, so the heart and the action can sit in
          it as buttons.
        */}
        <div className="relative bg-surface-elevated rounded-lg border border-border hover:border-primary-300 hover:shadow-sm transition-all flex flex-wrap items-center gap-3 p-3 sm:gap-4">
          <div className="relative w-20 h-20 xs:w-28 xs:h-28 sm:w-32 sm:h-32 flex-shrink-0 bg-surface-alt rounded-lg overflow-hidden">
            <OptimizedImage
              src={imageUrl}
              alt={product.title}
              fill
              sizes="(min-width: 640px) 128px, (min-width: 400px) 112px, 80px"
              className={`object-cover${outOfStock ? " opacity-50" : ""}`}
              fallbackSrc={PRODUCT_PLACEHOLDER}
              logContext={{ listingId: product.id, page: "product-card" }}
              priority={priority}
            />
            {outOfStock && <OutOfStockOverlay />}
            {isTrade && (
              <ProductBadge
                variant="trade"
                className="absolute top-1 left-1 p-1"
                icon={<ArrowsRightLeftIcon className="w-3 h-3" />}
                aria-hidden="true"
              />
            )}
            {favorite && (
              <ProductCardFavorite
                productId={product.id}
                sellerId={listing.sellerId}
                frameClassName="inset-0"
              />
            )}
          </div>
          <div className="flex-1 min-w-0">
            {isBoosted && (
              // Above the stretched link for its paid-placement tooltip.
              <ProductBadge
                variant="boosted"
                className="relative z-10 mb-1"
                aria-hidden="true"
                title={badgeLabels.boostedHint}
                icon={<RocketLaunchIcon className="w-3 h-3" />}
              >
                {badgeLabels.boosted}
              </ProductBadge>
            )}
            <h3 className="font-semibold text-heading line-clamp-2 text-base xs:text-xl sm:text-2xl leading-tight">
              {linkHref ? (
                <ProductCardTitleLink
                  href={linkHref}
                  title={product.title}
                  badgeSummary={describeProductBadges(listBadges, badgeLabels)}
                  onClick={trackClick}
                />
              ) : (
                product.title
              )}
            </h3>
            {showMeta && (
              <div className="flex items-center gap-3 mt-2 text-xs xs:text-sm sm:text-base text-subtle xs:gap-4">
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
          {/*
            Below `xs`: one full-width, right-aligned line (old price, price,
            discount badge, icon-only action). From `xs` up: the right column,
            the text action under the price.
          */}
          <ProductCardPriceRow
            listing={listing}
            layout="list"
            withAction={withAction}
          >
            {onSale && (
              <span className="text-sm text-subtle line-through">
                {fmtTL(originalPrice)}
              </span>
            )}
            <p className="text-lg xs:text-xl sm:text-2xl font-bold text-primary-600 whitespace-nowrap">
              {fmtTL(effectivePrice)}
            </p>
            {salePercent >= 1 && (
              <ProductBadge
                variant="sale"
                className="xs:mt-1"
                aria-hidden="true"
              >
                %{salePercent}
              </ProductBadge>
            )}
          </ProductCardPriceRow>
        </div>
        {overlay && (
          <div className="absolute top-2 right-2 z-10">{overlay}</div>
        )}
        {footer && <div className="mt-2">{footer}</div>}
      </div>
    );
  }

  // Badges are drawn only when the caller leaves the top-left slot free.
  const gridBadges = overlayStart ? [] : selectProductCardBadges(product);

  return (
    <div className="@container relative group h-full flex flex-col overflow-hidden rounded border border-border bg-surface-elevated transition-all hover:border-primary-300 hover:shadow-md">
      <div className="relative aspect-square bg-surface-alt">
        <OptimizedImage
          src={imageUrl}
          alt={product.title}
          fill
          sizes={IMAGE_SIZES.productGrid}
          className={`object-cover group-hover:scale-[1.03] transition-transform duration-300${outOfStock ? " opacity-50" : ""}`}
          fallbackSrc={PRODUCT_PLACEHOLDER}
          logContext={{ listingId: product.id, page: "product-card" }}
          priority={priority}
        />
        {outOfStock && <OutOfStockOverlay />}
        {/* The top-left slot is `overlayStart`'s; when set, no badge stack. */}
        {!overlayStart && (
          <ProductCardBadges product={product} labels={badgeLabels} />
        )}
      </div>
      <div className="p-2.5 flex-1 flex flex-col">
        <h3 className="font-medium text-heading line-clamp-2 text-sm sm:text-md leading-tight mb-1 group-hover:text-primary-600 transition-colors">
          {linkHref ? (
            <ProductCardTitleLink
              href={linkHref}
              title={product.title}
              badgeSummary={describeProductBadges(gridBadges, badgeLabels)}
              onClick={trackClick}
            />
          ) : (
            product.title
          )}
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
          <ProductCardPriceRow
            listing={listing}
            layout="grid"
            withAction={withAction}
          >
            {onSale && (
              <span className="text-sm text-subtle line-through ml-1.5">
                {fmtTL(originalPrice)}
              </span>
            )}
            <p className="font-bold text-primary-600 text-base sm:text-lg">
              {fmtTL(effectivePrice)}
            </p>
          </ProductCardPriceRow>
        </div>
      </div>
      {/* The top-right slot is `overlay`'s; when set, no heart. */}
      {favorite && !overlay && (
        <ProductCardFavorite
          productId={product.id}
          sellerId={listing.sellerId}
        />
      )}
      {footer && <div className="relative z-10 px-2.5 pb-2.5">{footer}</div>}
      {overlay && (
        <div className="absolute top-1.5 right-1.5 z-10">{overlay}</div>
      )}
      {overlayStart && (
        <div className="absolute top-1.5 left-1.5 z-10">{overlayStart}</div>
      )}
    </div>
  );
}

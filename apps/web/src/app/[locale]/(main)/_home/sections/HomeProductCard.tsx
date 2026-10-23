import Image from "next/image";
import ProductCardBadges from "@/components/ui/ProductCardBadges";
import ProductCardFavorite from "@/components/ui/ProductCardFavorite";
import ProductCardPriceRow from "@/components/ui/ProductCardAction";
import ProductCardTitleLink from "@/components/ui/ProductCardTitleLink";
import {
  describeProductBadges,
  selectProductCardBadges,
  type ProductBadgeLabels,
} from "@/lib/productCardBadges";
import { toProductCardListing } from "@/lib/productCardListing";
import {
  getProductEffectivePrice,
  getProductOriginalPriceForDisplay,
  isProductOnSaleDisplay,
  isProductOutOfStock,
} from "@/lib/productPrice";
import type { Product } from "@/types/product";
import { getImageUrl } from "../lib/helpers";
import { formatTL } from "@/lib/format";

// Para biçimi TEK yerden gelir (`lib/format`): ekranlar kendi
// `toLocaleString` çağrılarını yazdığında aynı ürün bir kartta "468 ₺",
// detayda "468,19 TL" görünüyor ve kart biçimi kuruşu YUVARLIYORDU.
const formatPrice = formatTL;

/**
 * Server-rendered home card; only the image itself uses Next's built-in loader.
 * It follows `ProductCard`'s grid rule: the title is the stretched link, the
 * badge stack (top-left, `ProductCardBadges`) and the heart (top-right) sit
 * on the image, and the price row carries the card action. The two client
 * islands, the heart (`ProductCardFavorite`) and the price row with the
 * action (`ProductCardPriceRow`), take primitive props, so the RSC payload
 * does not carry the whole product; the price itself is rendered here.
 */
export default function HomeProductCard({
  product,
  index,
  priority,
  badgeLabels,
  outOfStockLabel,
}: {
  product: Product;
  index: number;
  priority: boolean;
  badgeLabels: ProductBadgeLabels;
  outOfStockLabel: string;
}) {
  const firstImage = Array.isArray(product.images)
    ? product.images[0]
    : undefined;
  const imageUrl = getImageUrl(firstImage, index, product.title);
  const outOfStock = isProductOutOfStock(product);
  const onSale = isProductOnSaleDisplay(product);
  const listing = toProductCardListing(product);

  return (
    <div
      data-tour={index === 0 ? "home-product" : undefined}
      // Çerçeve (kenarlık) dış kapta: favori kalbinin çerçevesi
      // (`inset-x-0 top-0 aspect-square`) görselle piksel piksel çakışsın.
      className="@container group relative flex h-full flex-col overflow-hidden rounded border border-border bg-surface-elevated transition-all hover:border-primary-300 hover:shadow-md"
    >
      <div className="relative aspect-square bg-surface-alt">
        <Image
          src={imageUrl}
          alt={product.title}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 16vw"
          className={`object-cover transition-transform duration-300 group-hover:scale-[1.03]${outOfStock ? " opacity-50" : ""}`}
          priority={priority}
          unoptimized={imageUrl.startsWith("http")}
        />
        {outOfStock && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rounded bg-heading/70 px-2.5 py-1 text-2xs font-extrabold tracking-wide text-inverted">
              {outOfStockLabel}
            </span>
          </div>
        )}
        <ProductCardBadges product={product} labels={badgeLabels} />
      </div>

      <div className="flex flex-1 flex-col p-2.5">
        <h3 className="mb-1 line-clamp-2 text-sm font-medium leading-tight text-heading transition-colors group-hover:text-primary-600 sm:text-md">
          <ProductCardTitleLink
            href={`/listings/${product.id}`}
            title={product.title}
            badgeSummary={describeProductBadges(
              selectProductCardBadges(product),
              badgeLabels,
            )}
          />
        </h3>
        <div className="mt-auto">
          <ProductCardPriceRow listing={listing} layout="grid">
            {onSale && (
              <span className="ml-1.5 text-sm text-subtle line-through">
                {formatPrice(getProductOriginalPriceForDisplay(product))}
              </span>
            )}
            <p className="text-base font-bold text-primary-600 sm:text-lg">
              {formatPrice(getProductEffectivePrice(product))}
            </p>
          </ProductCardPriceRow>
        </div>
      </div>
      <ProductCardFavorite productId={product.id} sellerId={listing.sellerId} />
    </div>
  );
}

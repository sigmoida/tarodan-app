import Image from "next/image";
import { ArrowsRightLeftIcon } from "@heroicons/react/24/outline";
import { Link } from "@/i18n/navigation";
import {
  getProductEffectivePrice,
  getProductOriginalPriceForDisplay,
  isProductOnSaleDisplay,
  isProductOutOfStock,
} from "@/lib/productPrice";
import type { Product } from "@/types/product";
import { getImageUrl } from "../lib/helpers";

const formatPrice = (value: number) =>
  `${value.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} ₺`;

/** Server-rendered home card; only the image itself uses Next's built-in loader. */
export default function HomeProductCard({
  product,
  index,
  priority,
  sponsoredLabel,
  tradeLabel,
  outOfStockLabel,
}: {
  product: Product;
  index: number;
  priority: boolean;
  sponsoredLabel: string;
  tradeLabel: string;
  outOfStockLabel: string;
}) {
  const firstImage = Array.isArray(product.images)
    ? product.images[0]
    : undefined;
  const imageUrl = getImageUrl(firstImage, index, product.title);
  const outOfStock = isProductOutOfStock(product);
  const onSale = isProductOnSaleDisplay(product);
  const isTrade = Boolean(
    product.tradeAvailable ??
    (product.trade_available || product.isTradeEnabled),
  );

  return (
    <div
      data-tour={index === 0 ? "home-product" : undefined}
      className="group relative flex h-full flex-col"
    >
      <Link href={`/listings/${product.id}`} className="flex-1">
        <div className="flex h-full flex-col overflow-hidden rounded border border-border bg-surface-elevated transition-all hover:border-primary-300 hover:shadow-md">
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
            <div className="absolute left-1.5 top-1.5 flex flex-col items-start gap-1">
              {product.isBoosted && (
                <span className="rounded bg-warning-100 px-1.5 py-0.5 text-xs font-semibold text-warning-800">
                  {sponsoredLabel}
                </span>
              )}
              {isTrade && (
                <span className="inline-flex items-center gap-1 rounded bg-success-100 px-1.5 py-0.5 text-xs font-semibold text-success-800">
                  <ArrowsRightLeftIcon className="h-3 w-3" />
                  <span className="hidden sm:inline">{tradeLabel}</span>
                </span>
              )}
            </div>
            {onSale && (
              <span className="absolute right-1.5 top-1.5 rounded bg-danger-500 px-1.5 py-0.5 text-xs font-semibold text-inverted">
                %{product.discountPercent ?? 0}
              </span>
            )}
          </div>

          <div className="flex flex-1 flex-col p-2.5">
            <h3 className="mb-1 line-clamp-2 text-sm font-medium leading-tight text-heading transition-colors group-hover:text-primary-600 sm:text-md">
              {product.title}
            </h3>
            <div className="mt-auto border-t border-border-subtle pt-1.5">
              {onSale && (
                <span className="ml-1.5 text-sm text-subtle line-through">
                  {formatPrice(getProductOriginalPriceForDisplay(product))}
                </span>
              )}
              <p className="text-md font-bold text-primary-600 sm:text-lg">
                {formatPrice(getProductEffectivePrice(product))}
              </p>
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}

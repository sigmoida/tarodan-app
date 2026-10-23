/** @format */

"use client";

import { Link } from "@/i18n/navigation";
import OptimizedImage from "@/components/OptimizedImage";
import { TagIcon } from "@heroicons/react/24/outline";
import { SectionCard } from "@/components/ui";
import { formatTL } from "@/lib/format";
import { useTranslations } from "next-intl";
import { isDigitalOrder } from "@tarodan/types";
import { getProductInfo, type OrderDetail } from "../_lib/types";

export default function ProductInfoCard({ order }: { order: OrderDetail }) {
  const t = useTranslations();
  const productInfo = getProductInfo(order);
  const title = productInfo?.title || t("order.product");
  const productImage =
    productInfo?.imageUrl || order.items?.[0]?.product?.imageUrl;
  // The ONE source of the product amount is `pricing.subtotal`. `items[].price`
  // is NOT a fallback: the API fills it from `order.totalAmount`, the buyer's
  // total, so using it would show that total to the seller.
  const productAmount = order.pricing?.subtotal ?? null;
  // Multi-quantity order: show the real quantity and unit price (line amount / quantity).
  const quantity = order.items?.[0]?.quantity ?? 1;
  const unitPrice =
    productAmount != null && quantity > 0 ? productAmount / quantity : null;

  return (
    <SectionCard title={t("product.productInfo")}>
      <div className="flex gap-4">
        <div className="relative w-24 h-24 bg-surface-alt rounded-lg overflow-hidden flex-shrink-0">
          {productImage ? (
            <OptimizedImage
              src={productImage}
              alt={title}
              fill
              sizes="96px"
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-surface">
              <TagIcon className="w-8 h-8 text-border-strong" />
            </div>
          )}
        </div>
        <div className="flex-1">
          {/* A digital order sells a virtual product (membership, boost) with
              no listing page, so its title is plain text (D4). */}
          {isDigitalOrder(order) ? (
            <p className="text-lg font-medium text-heading">{title}</p>
          ) : (
            <Link
              href={`/listings/${productInfo?.id}`}
              className="text-lg font-medium text-heading hover:text-primary-600 transition-colors"
            >
              {title}
            </Link>
          )}
          <p className="text-sm text-muted mt-1">
            {unitPrice != null
              ? `${quantity} ${t("order.unitTimes")} ${formatTL(unitPrice)}`
              : `${quantity} ${t("order.unitOnly")}`}
          </p>
          {productAmount != null && (
            <p className="text-xl font-bold text-primary-500 mt-2">
              {formatTL(productAmount)}
            </p>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

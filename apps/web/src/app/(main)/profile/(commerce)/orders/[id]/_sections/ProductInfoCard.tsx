/** @format */

"use client";

import Link from "next/link";
import OptimizedImage from "@/components/OptimizedImage";
import { TagIcon } from "@heroicons/react/24/outline";
import { SectionCard } from "@/components/ui";
import { formatTL } from "@/lib/format";
import { useTranslations } from "next-intl";
import { getProductInfo, orderAmountOf, type OrderDetail } from "../_lib/types";

export default function ProductInfoCard({ order }: { order: OrderDetail }) {
  const t = useTranslations();
  const productInfo = getProductInfo(order);
  const productImage =
    productInfo?.imageUrl || order.items?.[0]?.product?.imageUrl;
  const orderAmount = orderAmountOf(order);

  return (
    <SectionCard title={t("product.productInfo")}>
      <div className="flex gap-4">
        <div className="relative w-24 h-24 bg-surface-alt rounded-lg overflow-hidden flex-shrink-0">
          {productImage ? (
            <OptimizedImage
              src={productImage}
              alt={productInfo?.title || t("order.product")}
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
          <Link
            href={`/listings/${productInfo?.id}`}
            className="text-lg font-medium text-heading hover:text-primary-500 transition-colors"
          >
            {productInfo?.title || t("order.product")}
          </Link>
          <p className="text-sm text-muted mt-1">{t("order.quantityOne")}</p>
          <p className="text-xl font-bold text-primary-500 mt-2">
            {formatTL(orderAmount)}
          </p>
        </div>
      </div>
    </SectionCard>
  );
}

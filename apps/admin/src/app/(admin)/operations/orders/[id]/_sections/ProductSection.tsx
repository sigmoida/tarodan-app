"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { getProductEffectivePrice } from "@/lib/product-price";
import { fmtTry } from "@/lib/format";
import { SectionCard } from "@/components/detail/SectionCard";
import type { OrderDetail } from "../types";

export function ProductSection({ order }: { order: OrderDetail }) {
  const t = useTranslations();
  return (
    <SectionCard title={t("admin.operations.orders.productTitle")}>
      <div className="flex gap-4">
        {order.product.images?.[0]?.url && (
          <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-surface-alt">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={order.product.images[0].url}
              alt={order.product.title}
              className="h-full w-full object-cover"
            />
          </div>
        )}
        <div className="flex-1">
          <Link
            href={`/catalog/products/${order.product.id}`}
            className="font-medium text-primary-600 hover:text-primary-700"
          >
            {order.product.title}
          </Link>
          <p className="mt-1 text-muted">
            {fmtTry(getProductEffectivePrice(order.product))}
          </p>
        </div>
      </div>
    </SectionCard>
  );
}

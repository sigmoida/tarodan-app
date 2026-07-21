/** @format */

import Image from "next/image";
import {
  Badge,
  productStatusConfig,
  productConditionConfig,
  enumLabel,
} from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { col, Empty } from "@/components/table";
import {
  getProductEffectivePrice,
  isProductOnSaleDisplay,
  getProductOriginalPriceForDisplay,
} from "@/lib/product-price";
import { fmtTry } from "@/lib/format";
import { productRowMenu, type ProductRowActions } from "./rowActions";
import { aiCheckConfig, aiCheckKey, type Product } from "./types";

// eslint-disable-next-line @tarodan/no-hardcoded-turkish -- URL query payload, not display copy
const PLACEHOLDER = "https://placehold.co/100x100/f3f4f6/666?text=Ürün";

type T = ReturnType<typeof useTranslations<never>>;

export type { ProductRowActions };

export function productColumns(t: T, actions: ProductRowActions) {
  return [
    col.custom<Product>(
      t("admin.catalog.common.product"),
      (p) => (
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative flex-shrink-0">
            <Image
              src={p.imageUrl || PLACEHOLDER}
              alt=""
              width={40}
              height={40}
              unoptimized
              className="h-10 w-10 rounded-lg bg-surface-alt object-cover"
            />
            {p.imageCount != null && p.imageCount > 1 && (
              <span className="absolute -bottom-1 -right-1 rounded bg-heading/80 px-1 text-[10px] font-medium text-inverted">
                {p.imageCount}
              </span>
            )}
          </div>
          <span className="truncate font-medium text-heading">{p.title}</span>
        </div>
      ),
      { grow: 3, minWidth: 220, sortKey: "title", sortType: "text" },
    ),
    col.custom<Product>(
      t("common.price"),
      (p) => (
        <span className="whitespace-nowrap font-medium tabular-nums text-primary-600">
          {isProductOnSaleDisplay(p) && (
            <span className="block text-sm text-muted line-through">
              {fmtTry(getProductOriginalPriceForDisplay(p))}
            </span>
          )}
          {fmtTry(getProductEffectivePrice(p))}
        </span>
      ),
      {
        minWidth: 120,
        sortKey: "price",
        sortType: "number",
      },
    ),
    col.muted<Product>(t("common.description"), (p) => p.description, {
      grow: 2,
    }),
    col.text<Product>(t("admin.catalog.common.brand"), (p) => p.brand?.name),
    col.number<Product>(
      t("admin.catalog.products.listingScore"),
      (p) => p.relevanceScore,
    ),
    col.custom<Product>(t("admin.catalog.products.tradeable"), (p) =>
      p.isTradeEnabled ? (
        <Badge variant="success" size="sm">
          ✓
        </Badge>
      ) : (
        <Empty />
      ),
    ),
    col.badge<Product>(
      t("common.status"),
      (p) => <Badge status={p.status} config={productStatusConfig} />,
      { sortKey: "status", sortType: "text" },
    ),
    col.badge<Product>(
      "AI",
      (p) =>
        p.aiCheckStatus ? (
          <Badge
            status={aiCheckKey(p.aiCheckStatus)}
            config={aiCheckConfig(t)}
          />
        ) : (
          <Empty />
        ),
      { sortKey: "aiCheckStatus", sortType: "text" },
    ),
    col.muted<Product>(
      t("admin.catalog.products.condition"),
      (p) => enumLabel(productConditionConfig, p.condition),
      { sortKey: "condition", sortType: "text" },
    ),
    col.user<Product>(
      t("admin.catalog.products.seller"),
      (p) => ({
        name: p.seller.displayName,
        href: `/accounts/users/${p.seller.id}`,
      }),
      { sortKey: "seller.displayName", sortType: "text" },
    ),
    col.id<Product>(t("admin.catalog.products.sellerId"), (p) => p.seller.id),
    col.text<Product>(t("common.category"), (p) => p.category.name, {
      sortKey: "category.name",
      sortType: "text",
    }),
    col.date<Product>(t("common.date"), "createdAt"),
    col.rowMenu<Product>(productRowMenu(t, actions)),
  ];
}

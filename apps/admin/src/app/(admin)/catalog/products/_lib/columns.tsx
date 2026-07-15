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

const PLACEHOLDER = "https://placehold.co/100x100/f3f4f6/666?text=Ürün";

type T = ReturnType<typeof useTranslations<never>>;

export type { ProductRowActions };

export function productColumns(t: T, actions: ProductRowActions) {
  return [
    col.custom<Product>(
      t("admin.catalog.common.product"),
      (p) => (
        <div className="flex min-w-0 items-center gap-3">
          <Image
            src={p.imageUrl || PLACEHOLDER}
            alt=""
            width={40}
            height={40}
            unoptimized
            className="h-10 w-10 flex-shrink-0 rounded-lg bg-surface-alt object-cover"
          />
          <span className="truncate font-medium text-heading">{p.title}</span>
        </div>
      ),
      { grow: 3, minWidth: 220 },
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
      { align: "right", minWidth: 120 },
    ),
    col.badge<Product>(t("common.status"), (p) => (
      <Badge status={p.status} config={productStatusConfig} />
    )),
    col.badge<Product>("AI", (p) =>
      p.aiCheckStatus ? (
        <Badge status={aiCheckKey(p.aiCheckStatus)} config={aiCheckConfig(t)} />
      ) : (
        <Empty />
      ),
    ),
    col.muted<Product>(t("admin.catalog.products.condition"), (p) =>
      enumLabel(productConditionConfig, p.condition),
    ),
    col.user<Product>(t("admin.catalog.products.seller"), (p) => ({
      name: p.seller.displayName,
      href: `/accounts/users/${p.seller.id}`,
    })),
    col.text<Product>(t("common.category"), (p) => p.category.name),
    col.date<Product>(t("common.date"), (p) => p.createdAt),
    col.rowMenu<Product>(productRowMenu(t, actions)),
  ];
}

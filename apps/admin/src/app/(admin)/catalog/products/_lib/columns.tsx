/** @format */

import { CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
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
import { aiCheckConfig, aiCheckKey, type Product } from "./types";

// eslint-disable-next-line @tarodan/no-hardcoded-turkish -- URL query payload, not display copy
const PLACEHOLDER = "https://placehold.co/100x100/f3f4f6/666?text=Ürün";

type T = ReturnType<typeof useTranslations<never>>;

export function productColumns(t: T) {
  return [
    col.product<Product>(
      t("admin.catalog.common.product"),
      (p) => ({
        title: p.title,
        secondary: `${t("admin.catalog.products.stock")}: ${
          p.quantity ?? t("admin.catalog.products.notSpecified")
        }`,
        image: p.imageUrl || PLACEHOLDER,
        href: `/catalog/products/${p.id}`,
      }),
      { minWidth: 560, sortKey: "title", sortType: "text" },
    ),
    col.user<Product>(
      t("admin.catalog.products.seller"),
      (p) => ({
        name: p.seller.displayName,
        secondary: p.seller.email,
        avatar: p.seller.avatarUrl,
        href: `/accounts/users/${p.seller.id}`,
      }),
      {
        grow: 6,
        minWidth: 420,
        sortKey: "seller.displayName",
        sortType: "text",
      },
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
    col.custom<Product>(
      t("admin.catalog.products.tradeable"),
      (p) =>
        p.isTradeEnabled ? (
          <CheckIcon
            className="h-5 w-5 text-success-600"
            aria-label={t("common.yes")}
          />
        ) : (
          <XMarkIcon
            className="h-5 w-5 text-danger-600"
            aria-label={t("common.no")}
          />
        ),
      { minWidth: 120 },
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
    col.text<Product>(t("common.category"), (p) => p.category.name, {
      sortKey: "category.name",
      sortType: "text",
    }),
    col.date<Product>(t("common.date"), "createdAt"),
  ];
}

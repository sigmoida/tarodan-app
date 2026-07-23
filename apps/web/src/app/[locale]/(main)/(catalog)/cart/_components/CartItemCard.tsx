/** @format */

"use client";

import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { TrashIcon } from "@heroicons/react/24/outline";
import { Badge, IconButton, QuantityStepper } from "@tarodan/ui";
import { SectionCard } from "@/components/ui";
import { useTranslations } from "next-intl";
import type { CartLineItem } from "../_lib/types";

const PLACEHOLDER = "https://via.placeholder.com/96";

const fmtTL = (n: number) =>
  n.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function CartItemCard({ item }: { item: CartLineItem }) {
  const t = useTranslations();
  const href = `/listings/${item.productId}`;
  const hasDiscount =
    item.isAvailable &&
    item.originalPrice != null &&
    item.originalPrice > item.price;
  const availabilityMessage =
    item.stockWarning ??
    (!item.isAvailable ? t("product.productNoLongerAvailable") : null);

  return (
    <SectionCard
      className={`p-4 flex gap-4 ${!item.isAvailable ? "!bg-surface-alt" : ""}`}
    >
      <Link href={href}>
        <div
          className={`w-28 h-28 rounded-lg overflow-hidden bg-surface-alt flex-shrink-0 ${!item.isAvailable ? "grayscale opacity-50" : ""}`}
        >
          <Image
            src={item.image || PLACEHOLDER}
            alt={item.title}
            width={112}
            height={112}
            className="object-cover w-full h-full"
          />
        </div>
      </Link>
      <div className="flex-1">
        <Link href={href}>
          <h3
            className={`font-semibold line-clamp-2 ${item.isAvailable ? "text-heading hover:text-primary-500" : "text-muted"}`}
          >
            {item.title}
          </h3>
        </Link>
        <p className="text-sm text-muted mt-1">
          {t("product.seller")}: @{item.sellerName}
        </p>
        <div className="mt-2">
          {hasDiscount && (
            <p className="text-sm text-subtle line-through">
              {fmtTL(item.originalPrice ?? 0)} TL
            </p>
          )}
          <p
            className={`text-lg font-bold ${item.isAvailable ? "text-primary-500" : "text-muted line-through"}`}
          >
            {fmtTL(item.price)} TL
          </p>
        </div>
        {availabilityMessage && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant="warning" size="sm">
              {availabilityMessage}
            </Badge>
            {!item.isAvailable && (
              <span className="text-sm font-medium text-muted">
                {t("cart.excludedFromTotal")}
              </span>
            )}
          </div>
        )}

        {/* Stok-duyarlı adet: + `maxQuantity`'de kilit. Adet > 1 ise satır toplamı da göster. */}
        {item.isAvailable && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <QuantityStepper
              value={item.quantity}
              max={item.maxQuantity}
              onChange={item.onQuantityChange}
              size="sm"
              decreaseLabel={t("cart.decreaseQuantity")}
              increaseLabel={t("cart.increaseQuantity")}
            />
            {item.quantity > 1 && (
              <span className="text-sm text-muted">
                {t("cart.lineTotal")}:{" "}
                <span className="font-semibold text-body">
                  {fmtTL(item.price * item.quantity)} TL
                </span>
              </span>
            )}
          </div>
        )}
      </div>
      <IconButton
        variant="danger"
        size="sm"
        onClick={item.onRemove}
        className="self-start"
        aria-label={t("cart.removeItem")}
      >
        <TrashIcon className="w-5 h-5" />
      </IconButton>
    </SectionCard>
  );
}

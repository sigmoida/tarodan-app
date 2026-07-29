/** @format */

"use client";

import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { Checkbox } from "@tarodan/ui";
import { ButtonLink } from "@/components/ui";
import OptimizedImage from "@/components/OptimizedImage";
import { getProductEffectivePrice } from "@/lib/productPrice";
import { formatTL } from "@/lib/format";
import { getTradeProductImage, type TradeProduct } from "../_lib/types";

interface TradeProductPickerProps {
  products: TradeProduct[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}

export default function TradeProductPicker({
  products,
  selectedIds,
  onToggle,
}: TradeProductPickerProps) {
  if (products.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="mb-4 text-muted">Takas edilebilir aktif ilanınız yok.</p>
        <ButtonLink
          variant="secondary"
          href="/profile/listings"
          className="gap-2"
        >
          İlanlarıma Git
          <ChevronRightIcon className="h-5 w-5" />
        </ButtonLink>
      </div>
    );
  }

  return (
    <div className="grid max-h-[400px] grid-cols-2 gap-4 overflow-y-auto">
      {products.map((product) => {
        const selected = selectedIds.includes(product.id);
        return (
          <label
            key={product.id}
            className={`relative block cursor-pointer rounded-xl border-2 p-4 transition-all ${
              selected
                ? "border-primary-500 ring-2 ring-primary-200"
                : "border-border hover:border-primary-300"
            }`}
          >
            <div className="absolute right-2 top-2 z-10">
              <Checkbox
                checked={selected}
                onChange={() => onToggle(product.id)}
              />
            </div>
            <div className="flex flex-col items-center gap-3">
              <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-surface-alt">
                <OptimizedImage
                  src={getTradeProductImage(product)}
                  alt={product.title}
                  fill
                  className="object-cover"
                  logContext={{
                    productId: product.id,
                    page: "trades-new-myproduct",
                  }}
                />
              </div>
              <div className="w-full text-center">
                <h3 className="mb-1 line-clamp-2 text-sm font-medium text-heading">
                  {product.title}
                </h3>
                <p className="text-base font-bold text-primary-500">
                  {formatTL(getProductEffectivePrice(product))}
                </p>
              </div>
            </div>
          </label>
        );
      })}
    </div>
  );
}

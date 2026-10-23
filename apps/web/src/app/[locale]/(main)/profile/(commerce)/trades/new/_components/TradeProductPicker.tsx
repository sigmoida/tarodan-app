/** @format */

"use client";

import { ChevronRightIcon, TagIcon } from "@heroicons/react/24/outline";
import { Button, Checkbox, EmptyState, Spinner } from "@tarodan/ui";
import { ButtonLink } from "@/components/ui";
import OptimizedImage from "@/components/OptimizedImage";
import { IMAGE_SIZES } from "@/lib/imageSizes";
import { getProductEffectivePrice } from "@/lib/productPrice";
import { formatTL } from "@/lib/format";
import { getTradeProductImage, type TradeProduct } from "../_lib/types";
import { useTranslations } from "next-intl";

interface TradeProductPickerProps {
  products: TradeProduct[];
  /** Fetching with nothing cached: show a spinner, never the empty state. */
  isLoading?: boolean;
  selectedIds: string[];
  onToggle: (id: string) => void;
  /** More pages exist on the server: show the "Show more" button. */
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

export default function TradeProductPicker({
  products,
  isLoading = false,
  selectedIds,
  onToggle,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
}: TradeProductPickerProps) {
  const t = useTranslations();
  if (isLoading && products.length === 0) {
    return (
      <div className="flex justify-center py-8">
        <Spinner size="lg" color="border-primary-500 border-t-transparent" />
      </div>
    );
  }
  if (products.length === 0) {
    return (
      <EmptyState
        size="compact"
        icon={<TagIcon className="h-6 w-6" />}
        title={t("page.new.tradeproductpicker.takasEdilebilirAktifIlaninizYok")}
        action={
          <ButtonLink
            variant="secondary"
            href="/profile/listings"
            className="gap-2"
          >
            {t("trade.goToMyListings")}
            <ChevronRightIcon className="h-5 w-5" />
          </ButtonLink>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
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
                    sizes={IMAGE_SIZES.pickerGrid}
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
      {hasMore && (
        <Button
          variant="secondary"
          className="self-center"
          onClick={onLoadMore}
          isLoading={isLoadingMore}
        >
          {t("common.loadMore")}
        </Button>
      )}
    </div>
  );
}

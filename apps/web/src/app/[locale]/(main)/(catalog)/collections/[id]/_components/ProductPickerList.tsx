/** @format */

"use client";

import { Link } from "@/i18n/navigation";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { Button, Spinner } from "@tarodan/ui";
import { getProductEffectivePrice } from "@/lib/productPrice";
import { PRODUCT_PLACEHOLDER } from "../_lib/add-item";
import type { UseAddItem } from "../_hooks/useAddItem";
import { formatTL } from "@/lib/format";

export default function ProductPickerList({ s }: { s: UseAddItem }) {
  const {
    t,
    products,
    loadingProducts,
    selectedProductIds,
    setSelectedProductIds,
    toggleProduct,
    close,
  } = s;

  return loadingProducts ? (
    <div className="flex justify-center py-8">
      <Spinner size="lg" color="border-primary-500 border-t-transparent" />
    </div>
  ) : products.length === 0 ? (
    <div className="py-8 text-center">
      <p className="mb-3 text-sm text-muted">
        {t("collection.noProductsToAdd")}
      </p>
      <Link
        href="/listings/new"
        className="inline-flex items-center text-sm font-medium text-primary-500 hover:text-primary-600"
        onClick={close}
      >
        {t("collection.createNewListing")}
        <ChevronRightIcon className="ml-1 h-4 w-4" />
      </Link>
    </div>
  ) : (
    <>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-muted">
          {selectedProductIds.length > 0
            ? `${selectedProductIds.length} ${t("collection.productsSelected")}`
            : t("collection.selectProducts")}
        </p>
        {selectedProductIds.length > 0 && (
          <Button
            variant="outline"
            onClick={() => setSelectedProductIds([])}
            className="text-xs font-medium text-primary-600 hover:text-primary-700"
          >
            {t("collection.clearSelection")}
          </Button>
        )}
      </div>

      <div className="space-y-1.5">
        {products.map((product) => {
          const img0 = product.images?.[0];
          const imageUrl = img0
            ? typeof img0 === "string"
              ? img0
              : ((img0 as any).cardUrl ??
                (img0 as any).detailUrl ??
                (img0 as any).url)
            : PRODUCT_PLACEHOLDER;
          const isSelected = selectedProductIds.includes(product.id);
          return (
            <Button
              variant="secondary"
              key={product.id}
              onClick={() => toggleProduct(product.id)}
              className={`flex w-full items-center gap-3 rounded p-2.5 transition-colors ${
                isSelected
                  ? "border border-primary-200 bg-primary-50"
                  : "border border-border-subtle bg-surface hover:bg-surface-alt"
              }`}
            >
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt={product.title}
                  className="h-12 w-12 rounded object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = PRODUCT_PLACEHOLDER;
                  }}
                />
                {isSelected && (
                  <div className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary-500">
                    <svg
                      className="h-2.5 w-2.5 text-inverted"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 text-left">
                <p className="line-clamp-1 text-sm font-medium text-heading">
                  {product.title}
                </p>
                <p className="text-xs font-semibold text-primary-600">
                  {formatTL(getProductEffectivePrice(product))}
                </p>
              </div>
            </Button>
          );
        })}
      </div>
    </>
  );
}

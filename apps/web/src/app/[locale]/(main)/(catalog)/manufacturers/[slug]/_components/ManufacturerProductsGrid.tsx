/** @format */

"use client";

import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { EmptyState } from "@tarodan/ui";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { useLocale, useTranslations } from "next-intl";
import ProductCard from "@/components/ui/ProductCard";
import type { Product } from "@/types/product";

export default function ManufacturerProductsGrid({
  products,
  isLoading,
}: {
  products: Product[];
  isLoading: boolean;
}) {
  const t = useTranslations();

  return (
    <div>
      <div className="flex items-end justify-between mb-8 px-2">
        <h2 className="text-3xl font-bold text-heading tracking-tight">
          {t("brands.manufacturerGrid.tumIlanlar")}
        </h2>
        <span className="text-subtle font-medium text-sm">
          {t("brands.manufacturerGrid.resultsShown", {
            count: products.length,
          })}
        </span>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {[1, 2, 3, 4, 5].map((n) => (
            <div
              key={n}
              className="bg-surface-elevated rounded-2xl h-[400px] animate-pulse"
            />
          ))}
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          icon={<MagnifyingGlassIcon className="h-7 w-7" />}
          title={
            t("brands.noProducts") ||
            t("brands.manufacturerGrid.ilanBulunamadi")
          }
          description={t("brands.manufacturerGrid.buUreticiyeAitHenuzBirIlan")}
          action={
            <ButtonLink href="/listings/new">
              {t("brands.manufacturerGrid.ilanVerenIlkKisiOl")}
            </ButtonLink>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {products.map((product, index) => (
            <ProductCard key={product.id} product={product} index={index} />
          ))}
        </div>
      )}
    </div>
  );
}

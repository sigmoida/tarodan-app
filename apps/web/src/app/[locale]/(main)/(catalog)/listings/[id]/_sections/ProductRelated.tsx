"use client";

import { ProductCard } from "@/components/ui";
import type { Product } from "@/types/product";
import { useListingDetail } from "../_context/ListingDetailContext";

/**
 * "Benzer Ürünler" — a full-width grid of same-category products, shown with the
 * standard marketplace ProductCard (6 per row on large screens, up to 12 items).
 * Hidden entirely while loading or when there is nothing to show.
 */
export default function ProductRelated() {
  const { t, similar, similarLoading } = useListingDetail();

  if (similarLoading || !similar || similar.length === 0) return null;

  return (
    <section className="mt-8">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-1 h-6 bg-primary-500 flex-shrink-0 rounded-sm" />
        <h2 className="text-2xl font-bold text-heading tracking-tight">
          {t("product.similarProducts")}
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {similar.map((product: Product, index: number) => (
          <ProductCard
            key={product.id}
            product={product}
            index={index}
            href={`/listings/${product.id}`}
          />
        ))}
      </div>
    </section>
  );
}

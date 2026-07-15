/** @format */

"use client";

import { useTranslations } from "next-intl";
import { EmptyStateCard, ProductCard } from "@/components/ui";
import type { Product } from "@/types/product";

export default function ListingsTab({
  products,
  noActiveMessage,
}: {
  products: Product[];
  noActiveMessage: string;
}) {
  const t = useTranslations();
  if (products.length === 0) {
    return (
      <EmptyStateCard
        title={t("product.noListings")}
        description={noActiveMessage}
      />
    );
  }
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {products.map((product, index) => (
        <ProductCard
          key={product.id}
          product={product}
          layout="grid"
          index={index}
          priority={index < 5}
        />
      ))}
    </div>
  );
}

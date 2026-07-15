/** @format */

"use client";

import { Link } from "@/i18n/navigation";
import { ArchiveBoxIcon } from "@heroicons/react/24/outline";
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
          Tüm İlanlar
        </h2>
        <span className="text-subtle font-medium text-sm">
          {products.length} sonuç gösteriliyor
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
        <div className="bg-surface-elevated rounded-2xl border border-border-subtle p-24 text-center shadow-sm">
          <div className="inline-flex items-center justify-center w-24 h-24 bg-surface rounded-full mb-6">
            <ArchiveBoxIcon className="w-10 h-10 text-border-strong" />
          </div>
          <h3 className="text-2xl font-bold text-heading mb-3">
            {t("brands.noProducts") || "İlan Bulunamadı"}
          </h3>
          <p className="text-muted max-w-md mx-auto mb-8">
            Bu üreticiye ait henüz bir ilan eklenmemiş.
          </p>
          <Link
            href="/listings/new"
            className="inline-block px-10 py-4 bg-heading text-inverted rounded-full font-bold shadow-sm hover:bg-primary-600 transition-all"
          >
            İlan Veren İlk Kişi Ol
          </Link>
        </div>
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

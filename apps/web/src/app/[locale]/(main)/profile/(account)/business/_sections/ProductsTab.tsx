/** @format */

"use client";

import SectionCard from "@/components/ui/SectionCard";
import ProductRow from "../_components/ProductRow";
import type { ProductStats } from "../_lib/types";
import { useTranslations } from "next-intl";

function ProductList({
  products,
  metric,
}: {
  products: ProductStats[];
  metric: "views" | "likes";
}) {
  const t = useTranslations();
  if (products.length === 0) {
    return (
      <p className="py-4 text-center text-muted">
        {t("page.business.productstab.henuzUrunIstatistigiYok")}
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {products.map((product, index) => (
        <ProductRow
          key={product.id}
          product={product}
          index={index}
          metric={metric}
        />
      ))}
    </div>
  );
}

export default function ProductsTab({
  topProducts,
}: {
  topProducts: { byViews: ProductStats[]; byLikes: ProductStats[] };
}) {
  const t = useTranslations();
  return (
    <div className="space-y-6">
      <SectionCard
        title={t("page.business.productstab.enCokGoruntulenenUrunler")}
      >
        <ProductList products={topProducts.byViews} metric="views" />
      </SectionCard>

      <SectionCard title={t("page.business.productstab.enCokBegenilenUrunler")}>
        <ProductList products={topProducts.byLikes} metric="likes" />
      </SectionCard>
    </div>
  );
}

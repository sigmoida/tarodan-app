/** @format */

import SectionCard from "@/components/ui/SectionCard";
import ProductRow from "../_components/ProductRow";
import type { ProductStats } from "../_lib/types";

function ProductList({
  products,
  metric,
}: {
  products: ProductStats[];
  metric: "views" | "likes";
}) {
  if (products.length === 0) {
    return (
      <p className="py-4 text-center text-muted">Henüz ürün istatistiği yok</p>
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
  return (
    <div className="space-y-6">
      <SectionCard title="En Çok Görüntülenen Ürünler">
        <ProductList products={topProducts.byViews} metric="views" />
      </SectionCard>

      <SectionCard title="En Çok Beğenilen Ürünler">
        <ProductList products={topProducts.byLikes} metric="likes" />
      </SectionCard>
    </div>
  );
}

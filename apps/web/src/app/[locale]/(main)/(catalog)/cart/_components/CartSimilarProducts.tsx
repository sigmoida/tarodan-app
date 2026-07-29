"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ProductCard, SectionCard } from "@/components/ui";
import { listingsApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import type { Product } from "@/types/product";

export default function CartSimilarProducts({
  productIds,
}: {
  productIds: string[];
}) {
  const t = useTranslations();
  const anchorId = productIds[0];
  const query = useQuery({
    queryKey: anchorId
      ? [...queryKeys.product.similar(anchorId), "cart"]
      : ["cart-similar", "empty"],
    queryFn: async (): Promise<Product[]> => {
      const response = await listingsApi.getSimilar(anchorId!, 4);
      const products = Array.isArray(response.data) ? response.data : [];
      const inCart = new Set(productIds.map(String));
      return products
        .filter((product) => !inCart.has(String(product.id)))
        .slice(0, 4);
    },
    enabled: !!anchorId,
    staleTime: 60_000,
  });

  if (!query.data?.length) return null;

  return (
    <section data-testid="cart-similar-products">
      <SectionCard
        title={t("product.similarProducts")}
        headerClassName="[&_h2]:text-xl"
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {query.data.map((product, index) => (
            <ProductCard
              key={product.id}
              product={product}
              index={index}
              href={`/listings/${product.id}`}
            />
          ))}
        </div>
      </SectionCard>
    </section>
  );
}

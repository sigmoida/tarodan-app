"use client";

import { ProductCard, SectionCard } from "@/components/ui";
import type { Product } from "@/types/product";
import { useListingDetail } from "../_context/ListingDetailContext";

/**
 * "Benzer Ürünler" — aynı kategorideki ürünlerin kart ızgarası.
 *
 * Ekrandaki diğer bölümlerle (özellikler, değerlendirmeler, satıcı) AYNI
 * `SectionCard` yüzeyini kullanır; eskiden başlığını elle çizip ızgarayı
 * kartsız basıyordu ve sayfadaki tek çerçevesiz bölüm oydu. Sütun sayısı da
 * ilan listesindeki ızgarayla aynı — 6 sütunda kartlar başka bir bileşen gibi
 * daralıyordu. Yüklenirken ya da sonuç yokken hiç render edilmez.
 */
export default function ProductRelated() {
  const { t, similar, similarLoading } = useListingDetail();

  if (similarLoading || !similar || similar.length === 0) return null;

  return (
    <div className="mt-8">
      <SectionCard title={t("product.similarProducts")}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {similar.map((product: Product, index: number) => (
            <ProductCard
              key={product.id}
              product={product}
              index={index}
              href={`/listings/${product.id}`}
            />
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

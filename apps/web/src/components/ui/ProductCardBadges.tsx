/** @format */

import { ArrowsRightLeftIcon } from "@heroicons/react/24/outline";
import { ProductBadge } from "@tarodan/ui";
import { selectProductCardBadges } from "@/lib/productCardBadges";
import type { Product } from "@/types/product";

/**
 * Grid kartının görselinin SOL ÜST köşesindeki dikey badge yığını (en fazla 2;
 * seçim ve sıra `selectProductCardBadges`'te). Sunucu/istemci fark etmez: hook
 * yok, metinler çağıran tarafından gelir. Sağ üstteki favori kalbine çarpmasın
 * diye genişliği kısıtlı, uzun kampanya adları kısaltılır (truncate).
 */
export default function ProductCardBadges({
  product,
  sponsoredLabel,
  tradeLabel,
}: {
  product: Product;
  sponsoredLabel: string;
  tradeLabel: string;
}) {
  const badges = selectProductCardBadges(product);
  if (badges.length === 0) return null;

  const cls = "max-w-full text-sm px-1.5 py-0.5";
  return (
    <div
      data-testid="product-card-badges"
      className="absolute top-1.5 left-1.5 flex max-w-[calc(100%-3.25rem)] flex-col items-start gap-1"
    >
      {badges.map((badge) => {
        switch (badge.kind) {
          case "sale":
            return (
              <ProductBadge key="sale" variant="sale" className={cls}>
                %{badge.percent}
              </ProductBadge>
            );
          case "sponsored":
            return (
              <ProductBadge key="sponsored" variant="sponsored" className={cls}>
                <span className="truncate">{sponsoredLabel}</span>
              </ProductBadge>
            );
          case "trade":
            return (
              <ProductBadge
                key="trade"
                variant="trade"
                className={cls}
                icon={<ArrowsRightLeftIcon className="w-2.5 h-2.5" />}
              >
                <span className="truncate">{tradeLabel}</span>
              </ProductBadge>
            );
          case "campaign":
            return (
              <ProductBadge key="campaign" variant="rare" className={cls}>
                <span className="truncate">{badge.label}</span>
              </ProductBadge>
            );
        }
      })}
    </div>
  );
}

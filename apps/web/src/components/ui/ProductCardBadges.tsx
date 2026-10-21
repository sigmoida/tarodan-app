/** @format */

import { ArrowsRightLeftIcon } from "@heroicons/react/24/outline";
import { ProductBadge } from "@tarodan/ui/product-badge";
import {
  describeProductBadges,
  selectProductCardBadges,
} from "@/lib/productCardBadges";
import type { Product } from "@/types/product";

/**
 * Grid kartının görselinin SOL ÜST köşesindeki dikey badge yığını (en fazla 2;
 * seçim ve sıra `selectProductCardBadges`'te). Sunucu/istemci fark etmez: hook
 * yok, metinler çağıran tarafından gelir. Sağ üstteki favori kalbine çarpmasın
 * diye genişliği kısıtlı, uzun kampanya adları kısaltılır (truncate). Görsel
 * rozetler `aria-hidden`'dır; ekran okuyucu `describeProductBadges` metnini
 * ("%38 indirim, Takas") okur — liste kartıyla aynı biçim.
 */
export default function ProductCardBadges({
  product,
  sponsoredLabel,
  tradeLabel,
  discountLabel,
}: {
  product: Product;
  sponsoredLabel: string;
  tradeLabel: string;
  /** "indirim" — yalnız erişilebilir ad için ("%38 indirim"). */
  discountLabel: string;
}) {
  const badges = selectProductCardBadges(product);
  if (badges.length === 0) return null;

  const cls = "max-w-full text-sm px-1.5 py-0.5";
  const summary = describeProductBadges(badges, {
    discount: discountLabel,
    sponsored: sponsoredLabel,
    trade: tradeLabel,
  });
  return (
    <div
      data-testid="product-card-badges"
      className="absolute top-1.5 left-1.5 flex max-w-[calc(100%-3.25rem)] flex-col items-start gap-1"
    >
      {badges.map((badge) => {
        switch (badge.kind) {
          case "sale":
            return (
              <ProductBadge
                key="sale"
                variant="sale"
                className={cls}
                aria-hidden="true"
              >
                %{badge.percent}
              </ProductBadge>
            );
          case "sponsored":
            return (
              <ProductBadge
                key="sponsored"
                variant="boosted"
                className={cls}
                aria-hidden="true"
              >
                <span className="truncate">{sponsoredLabel}</span>
              </ProductBadge>
            );
          case "trade":
            return (
              <ProductBadge
                key="trade"
                variant="trade"
                className={cls}
                aria-hidden="true"
                icon={<ArrowsRightLeftIcon className="w-2.5 h-2.5" />}
              >
                <span className="truncate">{tradeLabel}</span>
              </ProductBadge>
            );
          case "campaign":
            return (
              <ProductBadge
                key="campaign"
                variant="rare"
                className={cls}
                aria-hidden="true"
              >
                <span className="truncate">{badge.label}</span>
              </ProductBadge>
            );
        }
      })}
      <span className="sr-only">{summary}</span>
    </div>
  );
}

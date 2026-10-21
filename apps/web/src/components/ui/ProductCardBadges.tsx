/** @format */

import {
  ArrowsRightLeftIcon,
  RocketLaunchIcon,
} from "@heroicons/react/24/outline";
import { ProductBadge } from "@tarodan/ui/product-badge";
import {
  selectProductCardBadges,
  type ProductBadgeLabels,
} from "@/lib/productCardBadges";
import type { Product } from "@/types/product";

/**
 * The vertical badge stack at the TOP LEFT of a grid card's image (at most
 * two; the selection and order are `selectProductCardBadges`). Server- and
 * client-safe: no hooks, the copy comes from the caller. Its width leaves room
 * for the favourite heart at the top right; long campaign names truncate.
 *
 * Visual only: every badge is `aria-hidden`, and the card's title link reads
 * the same badges as one text (`describeProductBadges`). The stack sits above
 * the card's stretched title link (`z-10`) so the boosted badge can show its
 * paid-placement tooltip (`title`); the rest of the stack lets clicks through
 * to the link.
 */
export default function ProductCardBadges({
  product,
  labels,
}: {
  product: Product;
  labels: ProductBadgeLabels;
}) {
  const badges = selectProductCardBadges(product);
  if (badges.length === 0) return null;

  const cls = "max-w-full text-sm px-1.5 py-0.5";
  return (
    <div
      data-testid="product-card-badges"
      className="pointer-events-none absolute top-1.5 left-1.5 z-10 flex max-w-[calc(100%-3.25rem)] flex-col items-start gap-1"
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
          case "boosted":
            return (
              <ProductBadge
                key="boosted"
                variant="boosted"
                className={`${cls} pointer-events-auto`}
                aria-hidden="true"
                title={labels.boostedHint}
                icon={<RocketLaunchIcon className="w-2.5 h-2.5" />}
              >
                <span className="truncate">{labels.boosted}</span>
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
                <span className="truncate">{labels.trade}</span>
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
    </div>
  );
}

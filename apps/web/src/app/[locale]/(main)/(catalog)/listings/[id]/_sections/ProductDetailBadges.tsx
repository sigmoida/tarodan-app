import { ArrowsRightLeftIcon } from "@heroicons/react/24/outline";
import { ProductBadge } from "@tarodan/ui/product-badge";
import { getDetailBadges } from "../_lib/detailBadges";
import type { Listing } from "../_lib/types";

type Translator = (key: any) => string;

/** Başlık + fiyatın altındaki tek satır: %İndirim → Takas (Satıldı yok; durum uyarısı söylüyor). */
export default function ProductDetailBadges({
  listing,
  t,
}: {
  listing: Listing;
  t: Translator;
}) {
  const badges = getDetailBadges(listing);
  if (badges.length === 0) return null;

  return (
    <div
      data-testid="detail-badges"
      className="mt-2 flex flex-wrap items-center gap-2"
    >
      {badges.map((badge) => {
        switch (badge.kind) {
          case "sale":
            return (
              <ProductBadge key="sale" variant="sale">
                %{badge.percent}
              </ProductBadge>
            );
          case "trade":
            return (
              <ProductBadge
                key="trade"
                variant="trade"
                icon={<ArrowsRightLeftIcon className="w-3 h-3" />}
              >
                {t("faq.trade")}
              </ProductBadge>
            );
        }
      })}
    </div>
  );
}

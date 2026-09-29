import { useTranslations } from "next-intl";
import { InformationCircleIcon } from "@heroicons/react/24/outline";
import type { AdminOrderOfferInfo } from "@tarodan/types";
import { cn } from "@/lib/utils";
import { fmtTry } from "@/lib/format";
import { priceDiffTone } from "../../_lib/rowView";

const TONE_CLASS = {
  positive: "text-success-600",
  negative: "text-danger-600",
  default: "text-body",
} as const;

/**
 * Teklif ↔ ilan fiyatı: ilan fiyatı, teklif ve işaretli fark (ilan − teklif).
 * Teklif anındaki ilan fiyatı saklanmamış eski siparişte güncel fiyat
 * gösterilir ve bir ipucu bunun yaklaşık olduğunu söyler.
 */
export function PriceDiffCell({ offer }: { offer: AdminOrderOfferInfo }) {
  const t = useTranslations();
  const diff = offer.priceDifference;
  return (
    <div className="flex flex-col text-xs leading-tight tabular-nums">
      <span className="flex items-center gap-1 whitespace-nowrap text-muted">
        {t("admin.operations.orders.cells.listingPrice")}{" "}
        {fmtTry(offer.listingPrice) ?? "—"}
        {offer.listingPriceApproximate && (
          // Native title: the admin app mounts no TooltipProvider.
          <span
            title={t("admin.operations.orders.cells.listingPriceApproximate")}
          >
            <InformationCircleIcon
              className="h-3.5 w-3.5 text-warning-600"
              aria-label={t(
                "admin.operations.orders.cells.listingPriceApproximate",
              )}
            />
          </span>
        )}
      </span>
      <span className="whitespace-nowrap text-body">
        {t("admin.operations.orders.cells.offerAmount")} {fmtTry(offer.amount)}
      </span>
      <span
        className={cn(
          "whitespace-nowrap font-medium",
          TONE_CLASS[priceDiffTone(diff)],
        )}
      >
        {t("admin.operations.orders.cells.priceDifference")}{" "}
        {diff == null ? "—" : `${diff > 0 ? "+" : ""}${fmtTry(diff)}`}
      </span>
    </div>
  );
}

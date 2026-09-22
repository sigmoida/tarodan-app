import { useTranslations } from "next-intl";
import type { AdminOrderListRow } from "@tarodan/types";
import { fmtTry } from "@/lib/format";
import { PackageStack } from "./PackageStack";
import { PriceDiffCell } from "./PriceDiffCell";

/**
 * Birim fiyat, kalem hizasında. Teklif kaynaklı satırda birim fiyat pazarlık
 * tutarıdır; yanına ilan fiyatı ve farkı konur. Siparişe dönmemiş teklifte
 * yalnız fark bloğu vardır.
 */
export function UnitPriceCell({
  row,
}: {
  row: Pick<AdminOrderListRow, "packages" | "offer">;
}) {
  const t = useTranslations();
  const offer = row.offer;

  if (row.packages.length === 0) {
    return offer ? (
      <div className="flex h-16 items-center">
        <PriceDiffCell offer={offer} />
      </div>
    ) : null;
  }

  return (
    <PackageStack
      packages={row.packages}
      line={(line) =>
        offer ? (
          <PriceDiffCell offer={offer} />
        ) : (
          <div className="flex flex-col leading-tight tabular-nums">
            <span className="whitespace-nowrap text-sm font-medium text-body">
              {fmtTry(line.unitPrice)}
            </span>
            {line.quantity > 1 && (
              <span className="whitespace-nowrap text-xs text-muted">
                {t("admin.operations.orders.cells.lineSubtotal", {
                  count: line.quantity,
                  amount: fmtTry(line.subtotal) ?? "—",
                })}
              </span>
            )}
          </div>
        )
      }
    />
  );
}
